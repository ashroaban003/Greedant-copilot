import * as vscode from "vscode";
import {
  CMD_OPEN_CHAT,
  CMD_CLEAR_CHAT,
  VIEW_ID,
  CONFIG_SECTION,
} from "./constants";
import { GreedantConfig } from "./config/GreedantConfig";
import { OllamaProvider } from "./llm/OllamaProvider";
import { MockProvider } from "./llm/MockProvider";
import { ChatService } from "./chat/ChatService";
import { ChatController } from "./chat/ChatController";
import { GreedantViewProvider } from "./webview/GreedantViewProvider";

/**
 * Greedant extension entry point.
 *
 * Activation is minimal — we register the sidebar view provider and commands,
 * then let VS Code handle the lifecycle.
 *
 * Architecture:
 *   extension.ts (wiring)
 *     -> GreedantViewProvider (webview management)
 *       -> ChatController (request lifecycle)
 *         -> ChatService (orchestration)
 *           -> LLMProvider (Ollama, future: OpenAI, Anthropic, etc.)
 *
 * Future extensions:
 * - Register inline completion provider
 * - Register code action provider
 * - Register terminal link provider
 * - Watch workspace configuration changes for hot-reloading
 * - Register status bar item for connection status
 * - Register context menu commands (explain selection, generate tests, etc.)
 */

let viewProvider: GreedantViewProvider | undefined;

export function activate(context: vscode.ExtensionContext): void {
  // Initialize configuration
  const config = new GreedantConfig();

  // Initialize the LLM provider based on configuration
  // Using MockProvider for UI development. Switch to OllamaProvider for real usage:
   const provider = new OllamaProvider(config);
  //const provider = new MockProvider();

  // Initialize the chat pipeline
  const chatService = new ChatService(provider, config);
  const chatController = new ChatController(chatService);

  // Register the sidebar webview view provider
  viewProvider = new GreedantViewProvider(context.extensionUri, chatController);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VIEW_ID, viewProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand(CMD_OPEN_CHAT, () => {
      // Focus the Greedant sidebar panel
      vscode.commands.executeCommand(`${VIEW_ID}.focus`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(CMD_CLEAR_CHAT, () => {
      viewProvider?.clearChat();
    })
  );

  // Watch for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(CONFIG_SECTION)) {
        // Future: Hot-reload provider when settings change
        // For now, the config object reads live values on each access
      }
    })
  );
}

export function deactivate(): void {
  viewProvider?.dispose();
  viewProvider = undefined;
}
