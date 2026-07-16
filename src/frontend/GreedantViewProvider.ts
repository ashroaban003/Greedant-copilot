import * as vscode from "vscode";
import { VIEW_ID } from "../constants";
import { ChatConfig } from "../config/ChatConfig";
import { ChatController } from "../chat/ChatController";
import { WebviewMessage, ExtensionMessage, MSG } from "../chat/MessageProtocol";
import { buildChatHtml } from "./HtmlBuilder";

/**
 * GreedantViewProvider — webview lifecycle and message routing.
 *
 * This class is intentionally thin. It handles:
 * - Registering with VS Code's webview view system
 * - Loading the HTML (delegated to HtmlBuilder)
 * - Routing messages between the webview and ChatController
 *
 * No presentation logic or HTML assembly lives here.
 */
export class GreedantViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = VIEW_ID;

  private view?: vscode.WebviewView;
  private readonly chatController: ChatController;
  private readonly extensionUri: vscode.Uri;
  private readonly config: ChatConfig;

  constructor(extensionUri: vscode.Uri, chatController: ChatController, config: ChatConfig) {
    this.extensionUri = extensionUri;
    this.chatController = chatController;
    this.config = config;
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    this.loadContent(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(
      (message: WebviewMessage) => this.handleMessage(message),
      undefined,
      []
    );

    webviewView.onDidDispose(() => {
      this.view = undefined;
    });
  }

  // ─── Content Loading ───────────────────────────────────────────

  private async loadContent(webview: vscode.Webview): Promise<void> {
    try {
      webview.html = await buildChatHtml({
        webview,
        extensionUri: this.extensionUri,
        config: this.config,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      webview.html = `<html><body><p>Failed to load chat UI: ${msg}</p></body></html>`;
    }
  }

  // ─── Message Routing ───────────────────────────────────────────

  private async handleMessage(message: WebviewMessage): Promise<void> {
    switch (message.type) {
      case MSG.SEND_MESSAGE:
        await this.chatController.handleUserMessage(message.content, (msg) =>
          this.postMessage(msg)
        );
        break;

      case MSG.CLEAR_CHAT:
        this.chatController.clearChat((msg) => this.postMessage(msg));
        break;

      case MSG.READY:
        await this.onReady();
        break;

      case MSG.CANCEL_REQUEST:
        break;

      case MSG.REQUEST_MODELS:
        await this.chatController.handleModelListRequest((msg) => this.postMessage(msg));
        break;

      case MSG.SELECT_MODEL:
        await this.chatController.handleModelSelection(message.model, (msg) => this.postMessage(msg));
        break;
    }
  }

  private async onReady(): Promise<void> {
    const status = await this.chatController.checkProvider();
    if (!status.available && status.error) {
      this.postMessage({ type: MSG.ERROR, error: status.error });
    }
    // Eagerly send model list on ready
    await this.chatController.handleModelListRequest((msg) => this.postMessage(msg));
  }

  private postMessage(message: ExtensionMessage): void {
    this.view?.webview.postMessage(message);
  }

  // ─── Public API ────────────────────────────────────────────────

  public clearChat(): void {
    this.chatController.clearChat((msg) => this.postMessage(msg));
  }

  public reveal(): void {
    this.view?.show(true);
  }

  public dispose(): void {
    this.chatController.dispose();
  }
}
