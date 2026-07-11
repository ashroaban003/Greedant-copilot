/**
 * Minimal vscode module mock for unit testing.
 */
const workspace = {
  getConfiguration: jest.fn(() => ({
    get: jest.fn((key: string, defaultValue: any) => defaultValue),
  })),
};

// Mock editor state - can be modified in tests
let mockActiveTextEditor: any = null;

const window = {
  registerWebviewViewProvider: jest.fn(),
  get activeTextEditor() {
    return mockActiveTextEditor;
  },
};

// Helper to set mock editor state in tests
export function setMockActiveTextEditor(editor: any) {
  mockActiveTextEditor = editor;
}

// Helper to create a mock editor
export function createMockEditor(options: {
  fileName?: string;
  languageId?: string;
  lines?: string[];
  selectionStart?: { line: number; character: number };
  selectionEnd?: { line: number; character: number };
  cursorLine?: number;
}) {
  const {
    fileName = '/test/file.ts',
    languageId = 'typescript',
    lines = ['const x = 1;'],
    selectionStart,
    selectionEnd,
    cursorLine = 0,
  } = options;

  const hasSelection = selectionStart && selectionEnd;

  return {
    document: {
      fileName,
      languageId,
      lineCount: lines.length,
      lineAt: (lineNum: number) => ({
        text: lines[lineNum] || '',
      }),
    },
    selection: {
      isEmpty: !hasSelection,
      start: hasSelection ? { line: selectionStart.line, character: selectionStart.character } : { line: cursorLine, character: 0 },
      end: hasSelection ? { line: selectionEnd.line, character: selectionEnd.character } : { line: cursorLine, character: 0 },
      active: { line: cursorLine, character: 0 },
    },
  };
}

const commands = {
  registerCommand: jest.fn(),
  executeCommand: jest.fn(),
};

const Uri = {
  file: jest.fn((path: string) => ({ fsPath: path, toString: () => path })),
};

export { workspace, window, commands, Uri };
