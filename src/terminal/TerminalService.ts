/**
 * TerminalService — Manages VS Code terminal operations.
 * 
 * Provides ability to send commands to the integrated terminal,
 * with support for creating dedicated terminals and tracking execution.
 */

import * as vscode from "vscode";

const TERMINAL_NAME = "Greedant";

export class TerminalService {
  private terminal: vscode.Terminal | undefined;

  /**
   * Run a command in the VS Code integrated terminal.
   * Creates a new terminal if one doesn't exist or was closed.
   */
  async runCommand(command: string): Promise<void> {
    const terminal = this.getOrCreateTerminal();
    terminal.show(true); // preserveFocus = true
    terminal.sendText(command);
  }

  /**
   * Run multiple commands sequentially.
   */
  async runCommands(commands: string[]): Promise<void> {
    const terminal = this.getOrCreateTerminal();
    terminal.show(true);
    
    for (const cmd of commands) {
      terminal.sendText(cmd);
    }
  }

  /**
   * Get existing terminal or create a new one.
   */
  private getOrCreateTerminal(): vscode.Terminal {
    // Check if our terminal still exists
    if (this.terminal) {
      const exists = vscode.window.terminals.some(t => t === this.terminal);
      if (exists) {
        return this.terminal;
      }
    }

    // Look for existing Greedant terminal
    const existing = vscode.window.terminals.find(t => t.name === TERMINAL_NAME);
    if (existing) {
      this.terminal = existing;
      return existing;
    }

    // Create new terminal
    this.terminal = vscode.window.createTerminal(TERMINAL_NAME);
    return this.terminal;
  }

  /**
   * Show the terminal without running a command.
   */
  show(): void {
    this.getOrCreateTerminal().show();
  }

  /**
   * Dispose the managed terminal.
   */
  dispose(): void {
    this.terminal?.dispose();
    this.terminal = undefined;
  }
}
