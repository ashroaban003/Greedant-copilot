/**
 * SelectionProvider - Gathers code context from the active editor.
 *
 * Logic:
 * - If text is selected → use selection + surrounding lines
 * - If no selection → fallback to cursor line + surrounding lines
 */

import * as vscode from 'vscode';
import {
  getLanguageId,
  trimCommonWhitespace,
  getFileName,
} from '../utils/textUtils';

/** Number of lines to include before/after selection */
const SURROUNDING_LINES = 5;

export class SelectionProvider {
  /**
   * Get formatted context from the active editor.
   * Returns null if no editor is active.
   */
  getContext(): string | null {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return null;
    }

    const document = editor.document;
    const selection = editor.selection;
    const hasSelection = !selection.isEmpty;

    const startLine = hasSelection ? selection.start.line : selection.active.line;
    const endLine = hasSelection ? selection.end.line : selection.active.line;

    const totalLines = document.lineCount;
    const contextStart = Math.max(0, startLine - SURROUNDING_LINES);
    const contextEnd = Math.min(totalLines - 1, endLine + SURROUNDING_LINES);

    const fileName = getFileName(document.fileName);
    const langId = getLanguageId(document.languageId);

    // Line number padding based on largest line number
    const padding = String(contextEnd + 1).length;

    let header = `File: ${fileName}`;
    header += hasSelection
      ? ` (lines ${startLine + 1}-${endLine + 1})`
      : ` (line ${selection.active.line + 1})`;

    const body = hasSelection
      ? [
          ...this.gatherLines(document, contextStart, startLine - 1, padding),
          '<selected code>',
          ...this.gatherLines(document, startLine, endLine, padding),
          '</selected code>',
        ]
      : this.gatherLines(document, contextStart, contextEnd, padding);

    return `# Selected Code

Focus only on code between <selection>...</selection>,sorrounding codes are provided for context, 
if user asks for refactor/edit it is only for the selected codes and dont return <selection>&</selection> tags.
${header}
\`\`\`${langId} 
${body.join('\n')}
\`\`\``;
  }

  /**
   * Extract lines from document, dedent, and format with line numbers.
   * Returns empty array if from > to.
   */
  private gatherLines(
    document: vscode.TextDocument,
    from: number,
    to: number,
    padding: number
  ): string[] {
    if (from > to) {
      return [];
    }

    const raw: string[] = [];
    for (let i = from; i <= to; i++) {
      raw.push(document.lineAt(i).text);
    }

    const dedented = trimCommonWhitespace(raw);
    const result: string[] = [];
    for (let i = 0; i < dedented.length; i++) {
      const lineNum = String(from + i + 1).padStart(padding, ' ');
      result.push(`${lineNum} | ${dedented[i]}`);
    }

    return result;
  }
}
