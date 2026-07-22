import * as vscode from "vscode";
import { shouldExcludeFile } from "./codeBlockUtils";
import { getFileName } from "./textUtils";


/** Cached active editor snapshot - avoids repeated VS Code API calls */
interface ActiveEditorSnapshot {
  filePath: string | null;
  content: string | null;
  languageId: string | null;
  cursorLine: number | null;
  selectionText: string | null;
}

/** Get all active editor info in a single VS Code API access */
function getActiveEditorSnapshot(): ActiveEditorSnapshot {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.uri.scheme !== "file") {
    return { filePath: null, content: null, languageId: null, cursorLine: null, selectionText: null };
  }
  
  const selection = editor.selection;
  const selectionText = selection.isEmpty ? null : editor.document.getText(selection);
  
  return {
    filePath: editor.document.uri.fsPath,
    content: editor.document.getText(),
    languageId: editor.document.languageId,
    cursorLine: editor.selection.active.line,
    selectionText,
  };
}

export function getActiveFilePath(): string | null {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.uri.scheme !== "file") {
    return null;
  }
  return editor.document.uri.fsPath;
}

export function getActiveFileContent(): string | null {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return null;
  }
  return editor.document.getText();
}

export function getActiveFileLanguageId(): string | null {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return null;
  }
  return editor.document.languageId;
}

export function getActiveCursorLine(): number | null {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return null;
  }
  return editor.selection.active.line;
}

export { getActiveEditorSnapshot, ActiveEditorSnapshot };

export function getOpenFilePaths(maxLineCount: number = 2000): string[] {
  const activeUri = vscode.window.activeTextEditor?.document.uri.toString();

  return vscode.workspace.textDocuments
    .filter((doc) => {
      // Skip the active file
      if (doc.uri.toString() === activeUri) {
        return false;
      }
      // Skip non-file schemes (output, debug, etc.)
      if (doc.uri.scheme !== "file") {
        return false;
      }
      // Skip very large files
      if (doc.lineCount > maxLineCount) {
        return false;
      }
      // Skip excluded file types
      const name = getFileName(doc.fileName);
      if (shouldExcludeFile(name)) {
        return false;
      }
      return true;
    })
    .map((doc) => doc.uri.fsPath);
}

export function isFileOpen(filePath: string): boolean {
  const openPaths = getOpenFilePaths();
  return openPaths.includes(filePath);
}

export function createOpenFileChecker(): (filePath: string) => boolean {
  const openPathsSet = new Set(getOpenFilePaths());
  return (filePath: string) => openPathsSet.has(filePath);
}

export function isActiveFile(filePath: string): boolean {
  const activePath = getActiveFilePath();
  return activePath === filePath;
}

/**
 * Get file content and language ID by path.
 */
export async function getFileInfo(
  filePath: string
): Promise<{ content: string; languageId: string } | null> {
  try {
    const uri = vscode.Uri.file(filePath);
    const doc = await vscode.workspace.openTextDocument(uri);
    return {
      content: doc.getText(),
      languageId: doc.languageId,
    };
  } catch {
    return null;
  }
}
