/**
 * Minimal vscode module mock for unit testing.
 */
const workspace = {
  getConfiguration: jest.fn(() => ({
    get: jest.fn((key: string, defaultValue: any) => defaultValue),
  })),
};

const window = {
  registerWebviewViewProvider: jest.fn(),
};

const commands = {
  registerCommand: jest.fn(),
  executeCommand: jest.fn(),
};

const Uri = {
  file: jest.fn((path: string) => ({ fsPath: path, toString: () => path })),
};

export { workspace, window, commands, Uri };
