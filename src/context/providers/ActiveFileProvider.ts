/**
 * ActiveFileProvider — Extracts structural context from the currently active file.
 *
 * Provides the LLM with a "skeleton" of the file the user is working in:
 * imports, function/class signatures, and the function surrounding the cursor.
 * This gives the model awareness of the file's shape without blowing the token budget.
 */

import * as vscode from "vscode";
import { ContextItem, ContextPriority } from "../types";
import { extractFileStructure, CodeSymbol } from "../ASTLite";
import { getLanguageId, getFileName } from "../utils/textUtils";
import { TokenBudget } from "../TokenBudget";

export class ActiveFileProvider {
  private tokenBudget: TokenBudget;

  constructor(tokenBudget: TokenBudget) {
    this.tokenBudget = tokenBudget;
  }

  /**
   * Get structural context from the active editor file.
   * Returns null if no editor is active or file is empty.
   */
  getContext(maxTokens: number): ContextItem | null {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return null;
    }

    const document = editor.document;
    const content = document.getText();
    if (!content.trim()) {
      return null;
    }

    const fileName = getFileName(document.fileName);
    const langId = document.languageId;
    const cursorLine = editor.selection.active.line;

    // Extract file structure
    const structure = extractFileStructure(content, langId);
    if (structure.symbols.length === 0) {
      return null;
    }

    // Build context: skeleton + surrounding function body
    const contextParts: string[] = [];
    contextParts.push(`# Active File: ${fileName}`);

    // Add compact skeleton (imports + definitions list)
    if (structure.skeleton) {
      contextParts.push(structure.skeleton);
    }

    // Find and include the function/method the cursor is inside
    const surroundingFn = this.findSurroundingFunction(
      structure.symbols,
      content,
      cursorLine
    );
    if (surroundingFn) {
      const lang = getLanguageId(langId);
      contextParts.push(`\nCurrent function:`);
      contextParts.push(`\`\`\`${lang}\n${surroundingFn}\n\`\`\``);
    }

    const fullContent = contextParts.join("\n");

    // Trim to budget if needed
    const tokenCount = this.tokenBudget.estimateTokens(fullContent);
    let finalContent = fullContent;
    if (tokenCount > maxTokens) {
      // Prioritize skeleton over surrounding function
      const skeletonOnly = contextParts.slice(0, 2).join("\n");
      finalContent = skeletonOnly;
    }

    return {
      source: "activeFile",
      priority: ContextPriority.ActiveFile,
      relevanceScore: 10, // Always highly relevant
      content: finalContent,
      tokenCount: this.tokenBudget.estimateTokens(finalContent),
      filePath: document.fileName,
      label: `Active: ${fileName}`,
    };
  }

  /**
   * Find the function/method body surrounding the cursor position.
   * Returns the function text (limited to ~30 lines) or null.
   */
  private findSurroundingFunction(
    symbols: CodeSymbol[],
    content: string,
    cursorLine: number
  ): string | null {
    const lines = content.split("\n");

    // Find function symbols, sorted by line (descending) to find the nearest one above cursor
    const functions = symbols
      .filter((s) => s.type === "function" || s.type === "class")
      .sort((a, b) => b.line - a.line);

    // Find the closest function that starts at or before the cursor
    const enclosing = functions.find((f) => f.line <= cursorLine);
    if (!enclosing) {
      return null;
    }

    // Extract function body: from function start to its end (brace matching or indent)
    const startLine = enclosing.line;
    const endLine = this.findBlockEnd(lines, startLine);

    // Limit to 30 lines to save tokens
    const maxLines = 30;
    const actualEnd = Math.min(endLine, startLine + maxLines);
    const snippet = lines.slice(startLine, actualEnd + 1).join("\n");

    if (actualEnd < endLine) {
      return snippet + "\n  // ... (truncated)";
    }

    return snippet;
  }

  /**
   * Find the end of a code block starting at the given line.
   * Uses brace counting for C-style languages.
   */
  private findBlockEnd(lines: string[], startLine: number): number {
    let braceCount = 0;
    let foundOpen = false;

    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];
      for (const ch of line) {
        if (ch === "{") {
          braceCount++;
          foundOpen = true;
        } else if (ch === "}") {
          braceCount--;
          if (foundOpen && braceCount === 0) {
            return i;
          }
        }
      }
    }

    // Fallback: if no brace matching, use indent-based (for Python etc.)
    // or just return startLine + 20
    return Math.min(startLine + 20, lines.length - 1);
  }
}
