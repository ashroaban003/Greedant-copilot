/**
 * GrepProvider — Searches the workspace for relevant code using keywords.
 *
 * Uses VS Code's findTextInFiles API to search for symbols and terms
 * extracted from the user's query. Returns compact snippets of matching
 * code to give the LLM awareness of related code across the workspace.
 */

import * as vscode from "vscode";
import { ContextItem, ContextPriority } from "../types";
import { getFileName } from "../utils/textUtils";
import { TokenBudget } from "../TokenBudget";

/** Max results per search term */
const MAX_RESULTS_PER_TERM = 3;

/** Max total grep items to return */
const MAX_TOTAL_ITEMS = 5;

/** Lines of context around each match */
const CONTEXT_LINES = 2;

/** Max line length to include */
const MAX_LINE_LENGTH = 150;

/** Search timeout (ms) — abort if taking too long */
const SEARCH_TIMEOUT_MS = 7000;

/** File patterns to exclude from search */
const EXCLUDE_PATTERNS = [
  "**/node_modules/**",
  "**/dist/**",
  "**/out/**",
  "**/.git/**",
  "**/package-lock.json",
  "**/*.min.*",
  "**/coverage/**",
];

/** A single grep match with context */
interface GrepMatch {
  filePath: string;
  fileName: string;
  line: number;
  matchLine: string;
  contextBefore: string[];
  contextAfter: string[];
  searchTerm: string;
  /** True if this match came from filename matching (not content search) */
  isFilenameMatch?: boolean;
}

export class GrepProvider {
  private tokenBudget: TokenBudget;

  constructor(tokenBudget: TokenBudget) {
    this.tokenBudget = tokenBudget;
  }

  /**
   * Search workspace for keywords and return relevant context items.
   */
  async getContext(
    keywords: string[],
    maxTokens: number
  ): Promise<ContextItem[]> {
    if (keywords.length === 0 || maxTokens <= 0) {
      return [];
    }

    // Identify primary keywords (full identifiers) vs subset keywords (split parts)
    // A keyword is a subset if it's contained within another longer keyword
    const primaryKeywords: string[] = [];
    const subsetKeywords: string[] = [];

    for (const kw of keywords) {
      const kwLower = kw.toLowerCase();
      const isSubset = keywords.some(other => {
        const otherLower = other.toLowerCase();
        return otherLower !== kwLower && otherLower.includes(kwLower);
      });
      
      if (isSubset) {
        subsetKeywords.push(kw);
      } else {
        primaryKeywords.push(kw);
      }
    }

    console.log(`[GrepProvider] Primary keywords (for filename search): [${primaryKeywords.join(", ")}]`);
    console.log(`[GrepProvider] Subset keywords (content search only): [${subsetKeywords.join(", ")}]`);

    // Search for top 2 primary keywords with filename matching
    // Then search remaining keywords with content-only matching
    const searchTerms = keywords.slice(0, 3);
    const filenameSearchTerms = primaryKeywords.slice(0, 2);
    
    const allMatches: GrepMatch[] = [];

    for (const term of searchTerms) {
      if (term.length < 3) { continue; }
      const useFilenameSearch = filenameSearchTerms.includes(term);
      const matches = await this.searchWorkspace(term, useFilenameSearch);
      allMatches.push(...matches);
    }

    if (allMatches.length === 0) {
      return [];
    }

    // Deduplicate by file+line
    const unique = this.deduplicateMatches(allMatches);

    // Score and sort by relevance
    const scored = unique.map(match => ({
      match,
      score: this.scoreMatch(match, keywords),
    }));
    scored.sort((a, b) => b.score - a.score);

    const sorted = scored.slice(0, MAX_TOTAL_ITEMS);

    // Build context items
    const perItemBudget = Math.floor(maxTokens / sorted.length);
    const items: ContextItem[] = [];

    for (const { match, score } of sorted) {
      const item = this.buildMatchContext(match, perItemBudget, score);
      if (item) {
        items.push(item);
      }
    }

    return items;
  }

  /**
   * Score a match based on relevance.
   * Higher score = more relevant.
   * 
   * Scoring priority:
   * 1. Filename matches (huge boost)
   * 2. Filename contains a keyword
   * 3. Match line contains multiple keywords
   */
  private scoreMatch(match: GrepMatch, keywords: string[]): number {
    let score = 1; // Base score

    // Filename match is highest priority
    if (match.isFilenameMatch) {
      score += 100;
    }

    const fileNameLower = match.fileName.toLowerCase();
    const fileNameNoExt = fileNameLower.replace(/\.\w+$/, "");

    for (const keyword of keywords) {
      const kwLower = keyword.toLowerCase();

      // Highest boost: filename (without extension) exactly matches keyword
      if (fileNameNoExt === kwLower) {
        score += 50;
      }
      // Very high boost: filename contains the full keyword (not just partial)
      else if (fileNameNoExt.includes(kwLower) && kwLower.length >= 5) {
        score += 20;
      }
      // High boost: filename contains keyword
      else if (fileNameLower.includes(kwLower)) {
        score += 5;
      }

      // Boost if match line contains the keyword
      if (match.matchLine.toLowerCase().includes(kwLower)) {
        score += 2;
      }
    }

    // Extra boost if the search term (what actually matched) appears in filename
    const searchTermLower = match.searchTerm.toLowerCase();
    if (fileNameNoExt.includes(searchTermLower) && searchTermLower.length >= 5) {
      score += 15;
    }

    return score;
  }

  /**
   * Search workspace for a single term using VS Code API.
   * @param term - The search term
   * @param includeFilenameSearch - If true, also match filenames (for primary keywords only)
   */
  private async searchWorkspace(term: string, includeFilenameSearch: boolean): Promise<GrepMatch[]> {
    const matches: GrepMatch[] = [];

    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        console.log("[GrepProvider] No workspace folder");
        return [];
      }

      const exclude = EXCLUDE_PATTERNS.join(",");
      const termLower = term.toLowerCase();

      // PHASE 1: Targeted filename search using glob pattern
      if (includeFilenameSearch && term.length >= 4) {
        // Search for files whose name contains the term
        const filenamePattern = new vscode.RelativePattern(
          workspaceFolder,
          `**/*${term}*.{ts,js,tsx,jsx,vue,svelte,py,go,java,rs,rb,php}`
        );

        const filenameMatchFiles = await vscode.workspace.findFiles(filenamePattern, `{${exclude}}`, 10);
        console.log(`[GrepProvider] Filename glob search found ${filenameMatchFiles.length} files for "*${term}*"`);

        for (const fileUri of filenameMatchFiles) {
          if (matches.length >= MAX_RESULTS_PER_TERM) { break; }

          try {
            const doc = await vscode.workspace.openTextDocument(fileUri);
            const content = doc.getText();
            const lines = content.split("\n");
            const fileName = getFileName(fileUri.fsPath);

            console.log(`[GrepProvider] Processing filename match: ${fileName}`);

            // Find the main class/function definition (usually near the top)
            let definitionLine = -1;
            for (let i = 0; i < Math.min(lines.length, 50); i++) {
              const line = lines[i];
              // Look for class, interface, function, def, etc.
              if (/^\s*(public\s+)?(class|interface|abstract\s+class|function|def|func|struct|enum)\s+/i.test(line)) {
                definitionLine = i;
                break;
              }
            }

            // If no definition found, use first non-empty non-comment line
            if (definitionLine === -1) {
              for (let i = 0; i < Math.min(lines.length, 20); i++) {
                const trimmed = lines[i].trim();
                if (trimmed && !trimmed.startsWith("//") && !trimmed.startsWith("/*") && !trimmed.startsWith("*") && !trimmed.startsWith("#") && !trimmed.startsWith("package") && !trimmed.startsWith("import")) {
                  definitionLine = i;
                  break;
                }
              }
            }

            if (definitionLine === -1) { definitionLine = 0; }

            const contextBefore: string[] = [];
            const contextAfter: string[] = [];

            for (let b = Math.max(0, definitionLine - CONTEXT_LINES); b < definitionLine; b++) {
              contextBefore.push(lines[b]);
            }
            for (let a = definitionLine + 1; a <= Math.min(lines.length - 1, definitionLine + CONTEXT_LINES + 3); a++) {
              contextAfter.push(lines[a]);
            }

            matches.push({
              filePath: fileUri.fsPath,
              fileName,
              line: definitionLine + 1,
              matchLine: lines[definitionLine]?.slice(0, MAX_LINE_LENGTH) || "",
              contextBefore: contextBefore.map((l) => l.slice(0, MAX_LINE_LENGTH)),
              contextAfter: contextAfter.map((l) => l.slice(0, MAX_LINE_LENGTH)),
              searchTerm: term,
              isFilenameMatch: true,
            });
            console.log(`[GrepProvider] Added filename match: ${fileName}:${definitionLine + 1}`);
          } catch (e) {
            console.log(`[GrepProvider] Error reading file: ${e}`);
          }
        }
      }

      // PHASE 2: Content search (if we still need more matches)
      if (matches.length < MAX_RESULTS_PER_TERM) {
        const contentPattern = new vscode.RelativePattern(
          workspaceFolder,
          "**/*.{ts,js,tsx,jsx,vue,svelte,py,go,java,rs,rb,php,css,scss,html}"
        );

        const files = await vscode.workspace.findFiles(contentPattern, `{${exclude}}`, 50);
        console.log(`[GrepProvider] Content search: ${files.length} files for "${term}"`);

        for (const fileUri of files) {
          if (matches.length >= MAX_RESULTS_PER_TERM) { break; }

          // Skip files we already matched by filename
          if (matches.some(m => m.filePath === fileUri.fsPath)) { continue; }

          try {
            const doc = await vscode.workspace.openTextDocument(fileUri);
            const content = doc.getText();
            const lines = content.split("\n");

            for (let i = 0; i < lines.length; i++) {
              if (matches.length >= MAX_RESULTS_PER_TERM) { break; }

              if (lines[i].toLowerCase().includes(termLower)) {
                // Skip very long lines (likely minified)
                if (lines[i].length > MAX_LINE_LENGTH * 2) { continue; }

                const contextBefore: string[] = [];
                const contextAfter: string[] = [];

                for (let b = Math.max(0, i - CONTEXT_LINES); b < i; b++) {
                  contextBefore.push(lines[b]);
                }
                for (let a = i + 1; a <= Math.min(lines.length - 1, i + CONTEXT_LINES); a++) {
                  contextAfter.push(lines[a]);
                }

                matches.push({
                  filePath: fileUri.fsPath,
                  fileName: getFileName(fileUri.fsPath),
                  line: i + 1,
                  matchLine: lines[i].slice(0, MAX_LINE_LENGTH),
                  contextBefore: contextBefore.map((l) => l.slice(0, MAX_LINE_LENGTH)),
                  contextAfter: contextAfter.map((l) => l.slice(0, MAX_LINE_LENGTH)),
                  searchTerm: term,
                  isFilenameMatch: false,
                });
                console.log(`[GrepProvider] Content match in ${getFileName(fileUri.fsPath)}:${i + 1}`);
                // Skip nearby lines to avoid clustering
                i += CONTEXT_LINES + 1;
              }
            }
          } catch (e) {
            // Skip files that can't be opened
          }
        }
      }
    } catch (e) {
      console.log(`[GrepProvider] Search error: ${e}`);
    }

    console.log(`[GrepProvider] Total matches for "${term}": ${matches.length}`);
    return matches;
  }

  /**
   * Remove duplicate matches (same file + same line range).
   */
  private deduplicateMatches(matches: GrepMatch[]): GrepMatch[] {
    const seen = new Set<string>();
    const unique: GrepMatch[] = [];

    for (const match of matches) {
      const key = `${match.filePath}:${match.line}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(match);
      }
    }

    return unique;
  }

  /**
   * Build a context item from a grep match.
   */
  private buildMatchContext(match: GrepMatch, maxTokens: number, score: number): ContextItem | null {
    const lines: string[] = [
      ...match.contextBefore,
      `> ${match.matchLine}`,
      ...match.contextAfter,
    ];

    const snippet = lines.join("\n");
    const content = `${match.fileName}:${match.line} (match: "${match.searchTerm}")\n${snippet}`;

    const tokenCount = this.tokenBudget.estimateTokens(content);
    if (tokenCount > maxTokens && maxTokens > 0) {
      // Just include the match line
      const minimal = `${match.fileName}:${match.line}: ${match.matchLine}`;
      return {
        source: "grep",
        priority: ContextPriority.GrepSearch,
        relevanceScore: score,
        content: minimal,
        tokenCount: this.tokenBudget.estimateTokens(minimal),
        filePath: match.filePath,
        label: `Grep: ${match.fileName}:${match.line}`,
      };
    }

    return {
      source: "grep",
      priority: ContextPriority.GrepSearch,
      relevanceScore: score,
      content,
      tokenCount,
      filePath: match.filePath,
      label: `Grep: ${match.fileName}:${match.line}`,
    };
  }
}
