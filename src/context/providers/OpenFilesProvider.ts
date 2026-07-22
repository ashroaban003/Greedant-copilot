/**
 * OpenFilesProvider — Gathers context from other open editor tabs.
 *
 * Ranks open files by relevance to the current file and user query,
 * then provides compact structural summaries (via ASTLite) for the
 * most relevant ones.
 *
 * Relevance signals:
 * - Import relationship (current file imports this file)
 * - File name overlap with user query keywords
 * - Same language as current file
 * - Tab ordering (more recently viewed = higher)
 */

import * as vscode from "vscode";
import { ContextItem, ContextPriority } from "../types";
import { extractFileStructure } from "../ASTLite";
import { getFileName } from "../utils/textUtils";
import { TokenBudget } from "../TokenBudget";

/** Scoring weights for relevance */
const SCORE_IMPORT_MATCH = 5;
const SCORE_KEYWORD_EXACT_MATCH = 15;  // Filename matches keyword exactly
const SCORE_KEYWORD_CONTAINS = 8;      // Filename contains long keyword
const SCORE_KEYWORD_PARTIAL = 3;       // Filename contains short keyword
const SCORE_SAME_LANGUAGE = 2;
const SCORE_BASE = 1;  // Every open file gets at least this

/** Max open files to consider */
const MAX_FILES_TO_SCAN = 10;

/** Max files to include in context */
const MAX_FILES_IN_CONTEXT = 3;

export class OpenFilesProvider {
  private tokenBudget: TokenBudget;

  constructor(tokenBudget: TokenBudget) {
    this.tokenBudget = tokenBudget;
  }

  /**
   * Get context items from relevant open files.
   * Returns ranked list of context items from open tabs.
   */
  getContext(
    keywords: string[],
    maxTokens: number
  ): ContextItem[] {
    const activeEditor = vscode.window.activeTextEditor;
    const activeUri = activeEditor?.document.uri.toString();

    // Get all open text documents (visible tabs)
    const allDocs = vscode.workspace.textDocuments;

    const openDocs = allDocs.filter((doc) => {
      // Skip the active file (handled by ActiveFileProvider)
      if (doc.uri.toString() === activeUri) { return false; }
      // Skip non-file schemes (output, debug, etc.)
      if (doc.uri.scheme !== "file") { return false; }
      // Skip very large files
      if (doc.lineCount > 2000) { return false; }
      // Skip generated/config files
      const name = getFileName(doc.fileName);
      if (name.endsWith(".json") || name.endsWith(".lock") || name.endsWith(".map")) {
        return false;
      }
      return true;
    });

    if (openDocs.length === 0) {
      return [];
    }

    // Get imports from active file for relationship scoring
    const activeImports = this.getActiveFileImports(activeEditor);

    // Score and rank each open file
    const scored = openDocs
      .slice(0, MAX_FILES_TO_SCAN)
      .map((doc) => ({
        doc,
        score: this.scoreFile(doc, keywords, activeImports, activeEditor),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_FILES_IN_CONTEXT);

    if (scored.length === 0) {
      return [];
    }

    // Build context items with token budgeting
    const perFileBudget = Math.floor(maxTokens / scored.length);
    const items: ContextItem[] = [];

    for (const { doc, score } of scored) {
      const item = this.buildFileContext(doc, score, perFileBudget);
      if (item) {
        items.push(item);
      }
    }

    return items;
  }

  /**
   * Score an open file for relevance.
   */
  private scoreFile(
    doc: vscode.TextDocument,
    keywords: string[],
    activeImports: string[],
    activeEditor: vscode.TextEditor | undefined
  ): number {
    // Base score — every open file is somewhat relevant
    let score = SCORE_BASE;
    
    const fileName = getFileName(doc.fileName);
    const fileNameLower = fileName.toLowerCase();
    const fileNameNoExt = fileNameLower.replace(/\.\w+$/, "");

    // Import relationship: active file imports this file
    const fileBase = fileName.replace(/\.\w+$/, "");
    if (activeImports.some((imp) => imp.includes(fileBase))) {
      score += SCORE_IMPORT_MATCH;
    }

    // Keyword match: prioritize exact matches over partial
    for (const kw of keywords) {
      const kwLower = kw.toLowerCase();
      
      // Exact match (filename without extension equals keyword)
      if (fileNameNoExt === kwLower) {
        score += SCORE_KEYWORD_EXACT_MATCH;
      }
      // Contains long keyword (5+ chars) — more specific
      else if (fileNameNoExt.includes(kwLower) && kwLower.length >= 5) {
        score += SCORE_KEYWORD_CONTAINS;
      }
      // Contains any keyword
      else if (fileNameLower.includes(kwLower)) {
        score += SCORE_KEYWORD_PARTIAL;
      }
    }

    // Same language bonus
    if (activeEditor && doc.languageId === activeEditor.document.languageId) {
      score += SCORE_SAME_LANGUAGE;
    }

    return score;
  }

  /**
   * Build a compact context item for a single file.
   */
  private buildFileContext(
    doc: vscode.TextDocument,
    score: number,
    maxTokens: number
  ): ContextItem | null {
    const content = doc.getText();
    const fileName = getFileName(doc.fileName);
    const structure = extractFileStructure(content, doc.languageId);

    if (structure.symbols.length === 0) {
      return null;
    }

    // Build compact representation
    const parts: string[] = [];
    parts.push(`## ${fileName}`);
    parts.push(structure.skeleton);

    const contextContent = parts.join("\n");
    const tokenCount = this.tokenBudget.estimateTokens(contextContent);

    // Skip if even the skeleton exceeds budget
    if (tokenCount > maxTokens && maxTokens > 0) {
      // Just include imports + top-level names
      const minimal = `## ${fileName}\n${structure.symbols
        .filter((s) => s.type !== "import")
        .slice(0, 10)
        .map((s) => `  ${s.type} ${s.name}`)
        .join("\n")}`;

      return {
        source: "openFiles",
        priority: ContextPriority.OpenFiles,
        relevanceScore: score,
        content: minimal,
        tokenCount: this.tokenBudget.estimateTokens(minimal),
        filePath: doc.fileName,
        label: `Open: ${fileName}`,
      };
    }

    return {
      source: "openFiles",
      priority: ContextPriority.OpenFiles,
      relevanceScore: score,
      content: contextContent,
      tokenCount,
      filePath: doc.fileName,
      label: `Open: ${fileName}`,
    };
  }

  /**
   * Extract import paths from the active file for relationship scoring.
   */
  private getActiveFileImports(
    editor: vscode.TextEditor | undefined
  ): string[] {
    if (!editor) { return []; }

    const content = editor.document.getText();
    const imports: string[] = [];

    // Match import ... from '...' patterns
    const importRegex = /(?:import|from)\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }

    return imports;
  }
}
