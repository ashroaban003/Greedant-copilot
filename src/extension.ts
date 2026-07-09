import * as vscode from "vscode";
import {
  CMD_OPEN_CHAT,
  CMD_CLEAR_CHAT,
  VIEW_ID,
} from "./constants";
import { ChatConfig } from "./config/ChatConfig";
import { createProvider } from "./llm/ProviderFactory";
import { ChatService } from "./chat/ChatService";
import { ChatController } from "./chat/ChatController";
import { GreedantViewProvider } from "./frontend/GreedantViewProvider";

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
  const config = new ChatConfig();
  const provider = createProvider(config);

  const chatService = new ChatService(provider, config);
  const chatController = new ChatController(chatService);

  viewProvider = new GreedantViewProvider(context.extensionUri, chatController, config);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VIEW_ID, viewProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(CMD_OPEN_CHAT, () => {
      vscode.commands.executeCommand(`${VIEW_ID}.focus`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(CMD_CLEAR_CHAT, () => {
      viewProvider?.clearChat();
    })
  );
}

export function deactivate(): void {
  viewProvider?.dispose();
  viewProvider = undefined;
}
