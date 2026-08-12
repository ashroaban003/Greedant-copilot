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
import { ActiveFileProvider } from "./context/providers/ActiveFileProvider";
import { OpenFilesProvider } from "./context/providers/OpenFilesProvider";
import { GrepProvider } from "./context/providers/GrepProvider";
import { TokenBudget } from "./context/TokenBudget";
import { ContextManager } from "./context/ContextManager";
import { SmartKeywordExtractor } from "./agent/SmartKeywordExtractor";
import { TerminalService } from "./terminal/TerminalService";

let viewProvider: GreedantViewProvider | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const config = new ChatConfig();
  const provider = createProvider(config);

  // Initialize smart keyword extractor with LLM provider
  const smartKeywordExtractor = new SmartKeywordExtractor(provider);

  // Initialize context providers as singletons
  const tokenBudget = new TokenBudget();
  const selectionProvider = new SelectionProvider();
  const activeFileProvider = new ActiveFileProvider();
  const openFilesProvider = new OpenFilesProvider();
  const grepProvider = new GrepProvider();

  const contextManager = new ContextManager({
    tokenBudget,
    selectionProvider,
    activeFileProvider,
    openFilesProvider,
    grepProvider,
    smartKeywordExtractor,
  });

  const chatService = new ChatService(provider, config, contextManager);
  const terminalService = new TerminalService();
  const chatController = new ChatController(chatService, config, terminalService);

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
