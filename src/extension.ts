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
import { SelectionProvider } from "./context/providers/SelectionProvider";
import { ContextManager } from "./context/ContextManager";

/**
 * Greedant extension entry point.
 *
 * Architecture:
 *   extension.ts (wiring)
 *     -> GreedantViewProvider (webview management)
 *       -> ChatController (request lifecycle)
 *         -> ChatService (orchestration)
 *           -> ContextManager (context aggregation)
 *             -> SelectionProvider (editor context)
 *           -> LLMProvider (Ollama, etc.)
 */

let viewProvider: GreedantViewProvider | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const config = new ChatConfig();
  const provider = createProvider(config);

  // Context providers
  const selectionProvider = new SelectionProvider();
  const contextManager = new ContextManager(selectionProvider);

  const chatService = new ChatService(provider, config, contextManager);
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
