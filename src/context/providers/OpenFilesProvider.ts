/**
 * OpenFilesProvider — Discovers relevant open editor tabs.
 */

import * as vscode from "vscode";
import {
  FileCandidate,
  SmartKeywordResult,
  FILE_SCORING,
} from "../types";
import { getFileName } from "../utils/textUtils";
import { scoreFilenameAgainstKeywords } from "../utils/keywordMatcher";
import {
  getActiveFilePath,
  getActiveFileContent,
  getActiveFileLanguageId,
} from "../utils/fileDiscoveryUtils";
import { shouldExcludeFile, extractImportPaths } from "../utils/codeBlockUtils";

/** Max open files to consider */
const MAX_FILES_TO_SCAN = 10;

/** Max files to return */
const MAX_FILES_TO_RETURN = 5;

/** Min score for open file to be considered relevant */
const MIN_RELEVANCE_SCORE = 25;

export class OpenFilesProvider {
  constructor() {}

  getFileCandidates(keywords: SmartKeywordResult): FileCandidate[] {
    const activeFilePath = getActiveFilePath();
    const activeLanguageId = getActiveFileLanguageId();

    // Get imports from active file for relationship scoring
    const activeContent = getActiveFileContent();
    const activeImports = activeContent ? extractImportPaths(activeContent) : [];

    // Get all open text documents (excluding active file)
    const openDocs = this.getFilteredOpenDocs(activeFilePath);

    if (openDocs.length === 0) {
      return [];
    }

    // Score each open file
    const candidates: FileCandidate[] = openDocs
      .slice(0, MAX_FILES_TO_SCAN)
      .map((doc) => ({
        filePath: doc.fileName,
        score: this.scoreFile(doc, keywords, activeImports, activeLanguageId),
        source: "open" as const,
      }))
      // Only include files that have meaningful relevance (keyword match or import relationship)
      .filter((candidate) => candidate.score >= MIN_RELEVANCE_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_FILES_TO_RETURN);

    return candidates;
  }

  
  private getFilteredOpenDocs(activeFilePath: string | null): vscode.TextDocument[] {
    return vscode.workspace.textDocuments.filter((doc) => {
      // Skip the active file (handled by ActiveFileProvider)
      if (activeFilePath && doc.fileName === activeFilePath) {
        return false;
      }
      // Skip non-file schemes (output, debug, etc.)
      if (doc.uri.scheme !== "file") {
        return false;
      }
      // Skip very large files
      if (doc.lineCount > 2000) {
        return false;
      }
      // Skip excluded file types
      const name = getFileName(doc.fileName);
      if (shouldExcludeFile(name)) {
        return false;
      }
      return true;
    });
  }

  private scoreFile(
    doc: vscode.TextDocument,
    keywords: SmartKeywordResult,
    activeImports: string[],
    activeLanguageId: string | null
  ): number {
    // Base score for open files
    let score = FILE_SCORING.OPEN_FILES;

    const fileName = getFileName(doc.fileName);

    // Import relationship: active file imports this file
    const fileBase = fileName.replace(/\.\w+$/, "");
    if (activeImports.some((imp) => imp.includes(fileBase))) {
      score += FILE_SCORING.IMPORT_RELATIONSHIP;
    }

    // Keyword matching using shared utility
    score += scoreFilenameAgainstKeywords(fileName, keywords);

    // Same language bonus
    if (activeLanguageId && doc.languageId === activeLanguageId) {
      score += FILE_SCORING.SAME_LANGUAGE;
    }

    return score;
  }
}
