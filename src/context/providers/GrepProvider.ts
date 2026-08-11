/**
 * GrepProvider — Searches the workspace for relevant files using tiered keywords.
 */

import * as vscode from "vscode";
import {
  FileCandidate,
  SmartKeywordResult,
  FILE_SCORING,
} from "../types";
import { getFileName } from "../utils/textUtils";
import {
  EXCLUDE_GLOB_PATTERNS,
} from "../utils/codeBlockUtils";
import { scoreFilenameAgainstKeywords, shouldSkipTestFile } from "../utils/keywordMatcher";
import {
  isActiveFile,
  createOpenFileChecker,
} from "../utils/fileDiscoveryUtils";

/** Max results per search term */
const MAX_RESULTS_PER_TERM = 5;

/** Max total files to return */
const MAX_TOTAL_FILES = 8;

/** Supported file extensions for search */
const CODE_EXTENSIONS = "ts,js,tsx,jsx,vue,svelte,py,go,java,rs,rb,php";
const ALL_EXTENSIONS = `${CODE_EXTENSIONS},css,scss,html`;

/** A file match with score and match lines */
interface FileMatch {
  filePath: string;
  fileName: string;
  score: number;
  matchLines: number[];
  searchTerms: string[];
}

export class GrepProvider {
  constructor() {}

  async getFileCandidates(
    keywords: SmartKeywordResult
  ): Promise<FileCandidate[]> {
    if (keywords.tier1.length === 0 && keywords.tier2.length === 0) {
      return [];
    }

    const fileMatches = new Map<string, FileMatch>();
    
    // Create efficient open file checker (caches open paths)
    const isFileOpen = createOpenFileChecker();

    // Phase 1: Search for Tier1 keywords (file identification)
    for (const { keyword } of keywords.tier1.slice(0, 3)) {
      if (keyword.length < 3) { continue; }
      await this.searchWorkspace(keyword, true, fileMatches, keywords, isFileOpen);
    }

    if (fileMatches.size === 0) {
      return [];
    }

    // Convert to FileCandidate[], sort by score, and limit
    const candidates: FileCandidate[] = Array.from(fileMatches.values())
      .map((match) => ({
        filePath: match.filePath,
        score: match.score,
        source: "grep" as const,
        matchLines: match.matchLines.length > 0 ? match.matchLines : undefined,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_TOTAL_FILES);

    return candidates;
  }

  /**
   * Search workspace for a single term.
   * Adds matches to the fileMatches map (deduplicates by file path).
   */
  private async searchWorkspace(
    term: string,
    isTier1: boolean,
    fileMatches: Map<string, FileMatch>,
    keywords: SmartKeywordResult,
    isFileOpen: (filePath: string) => boolean
  ): Promise<void> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) { return; }

      const exclude = EXCLUDE_GLOB_PATTERNS.join(",");

      // Phase 1: Filename search (for longer terms)
      if (term.length >= 4) {
        await this.searchByFilename(workspaceFolder, term, exclude, isTier1, fileMatches, keywords, isFileOpen);
      }

      // Phase 2: Content search if we need more matches
      if (fileMatches.size < MAX_TOTAL_FILES) {
        await this.searchByContent(workspaceFolder, term, exclude, isTier1, fileMatches, keywords, isFileOpen);
      }
    } catch {
      // Search error, continue
    }
  }

  private async searchByFilename(
    workspaceFolder: vscode.WorkspaceFolder,
    term: string,
    exclude: string,
    isTier1: boolean,
    fileMatches: Map<string, FileMatch>,
    keywords: SmartKeywordResult,
    isFileOpen: (filePath: string) => boolean
  ): Promise<void> {
    const filenamePattern = new vscode.RelativePattern(
      workspaceFolder,
      `**/*${term}*.{${CODE_EXTENSIONS}}`
    );

    const files = await vscode.workspace.findFiles(filenamePattern, `{${exclude}}`, 15);

    for (const fileUri of files) {
      const filePath = fileUri.fsPath;

      // Skip active file and open files
      if (isActiveFile(filePath) || isFileOpen(filePath)) {
        continue;
      }

      // Skip if we already have enough matches
      if (fileMatches.size >= MAX_TOTAL_FILES && !fileMatches.has(filePath)) {
        continue;
      }

      const fileName = getFileName(filePath);

      // Early exit: skip test files with no exact keyword match
      if (shouldSkipTestFile(fileName, keywords)) {
        continue;
      }

      // Calculate score
      let score = FILE_SCORING.OTHER_FILES;
      if (isTier1) {
        score += FILE_SCORING.TIER1_FILENAME_EXACT;
      }
      score += scoreFilenameAgainstKeywords(fileName, keywords);

      // Add or update match
      const existing = fileMatches.get(filePath);
      if (existing) {
        existing.score = Math.max(existing.score, score);
        if (!existing.searchTerms.includes(term)) {
          existing.searchTerms.push(term);
        }
      } else {
        fileMatches.set(filePath, {
          filePath,
          fileName,
          score,
          matchLines: [],
          searchTerms: [term],
        });
      }
    }
  }

  /**
   * Search for content matching term.
   */
  private async searchByContent(
    workspaceFolder: vscode.WorkspaceFolder,
    term: string,
    exclude: string,
    isTier1: boolean,
    fileMatches: Map<string, FileMatch>,
    keywords: SmartKeywordResult,
    isFileOpen: (filePath: string) => boolean
  ): Promise<void> {
    const termLower = term.toLowerCase();
    const contentPattern = new vscode.RelativePattern(
      workspaceFolder,
      `**/*.{${ALL_EXTENSIONS}}`
    );

    const files = await vscode.workspace.findFiles(contentPattern, `{${exclude}}`, 50);
    let matchesFound = 0;

    for (const fileUri of files) {
      if (matchesFound >= MAX_RESULTS_PER_TERM) { break; }

      const filePath = fileUri.fsPath;

      // Skip active file and open files
      if (isActiveFile(filePath) || isFileOpen(filePath)) {
        continue;
      }

      // Skip if we already have this file from filename search
      if (fileMatches.has(filePath)) {
        continue;
      }

      const fileName = getFileName(filePath);

      // Early exit: skip test files with no exact keyword match (before reading content)
      if (shouldSkipTestFile(fileName, keywords)) {
        continue;
      }

      try {
        const doc = await vscode.workspace.openTextDocument(fileUri);
        const content = doc.getText();
        const lines = content.split("\n");

        // Find all lines containing the term
        const matchingLines: number[] = [];
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].length > 500) { continue; } // Skip minified lines
          if (lines[i].toLowerCase().includes(termLower)) {
            matchingLines.push(i);
            if (matchingLines.length >= 5) { break; } // Limit lines per file
          }
        }

        if (matchingLines.length > 0) {
          // Calculate score
          let score = FILE_SCORING.OTHER_FILES;
          if (isTier1) {
            score += FILE_SCORING.TIER1_CONTENT_MATCH;
          }
          score += scoreFilenameAgainstKeywords(fileName, keywords);
          // Bonus for multiple matches
          score += Math.min(matchingLines.length * 5, 20);

          fileMatches.set(filePath, {
            filePath,
            fileName,
            score,
            matchLines: matchingLines,
            searchTerms: [term],
          });

          matchesFound++;
        }
      } catch {
        // Skip files that can't be opened
      }
    }
  }
}
