import * as vscode from "vscode";
import { VIEW_ID } from "../constants";
import { ChatController } from "../chat/ChatController";
import { WebviewMessage, ExtensionMessage } from "../chat/ChatTypes";
import { getWebviewContent } from "./getWebviewContent";

/**
 * GreedantViewProvider manages the sidebar webview panel.
 *
 * It implements vscode.WebviewViewProvider to render the chat UI
 * and acts as the bridge between the webview and the ChatController.
 *
 * Message flow:
 *   Webview -> postMessage -> GreedantViewProvider -> ChatController -> ChatService -> LLMProvider
 *   LLMProvider -> ChatService -> ChatController -> GreedantViewProvider -> postMessage -> Webview
 *
 * Future extensions:
 * - Multiple webview panels (inline chat, diff view)
 * - State serialization/restoration
 * - Context menu integration
 * - Drag-and-drop file references
 * - Webview panel for code previews
 */
export class GreedantViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = VIEW_ID;

  private view?: vscode.WebviewView;
  private chatController: ChatController;
  private extensionUri: vscode.Uri;

  constructor(extensionUri: vscode.Uri, chatController: ChatController) {
    this.extensionUri = extensionUri;
    this.chatController = chatController;
  }

  /**
   * Called by VS Code when the webview view is first shown.
   */
  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;

    // Configure webview options
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    // Set the HTML content
    webviewView.webview.html = getWebviewContent(
      webviewView.webview,
      this.extensionUri
    );

    // Listen for messages from the webview
    webviewView.webview.onDidReceiveMessage(
      (message: WebviewMessage) => this.handleWebviewMessage(message),
      undefined,
      []
    );

    // Handle visibility changes
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        // Future: Refresh context when panel becomes visible
        // e.g., update active file info, refresh model status
      }
    });

    webviewView.onDidDispose(() => {
      this.view = undefined;
    });
  }

  /**
   * Process messages coming from the webview.
   */
  private async handleWebviewMessage(message: WebviewMessage): Promise<void> {
    switch (message.type) {
      case "sendMessage":
        await this.chatController.handleUserMessage(
          message.content,
          (msg) => this.postMessageToWebview(msg)
        );
        break;

      case "clearChat":
        this.chatController.clearChat((msg) => this.postMessageToWebview(msg));
        break;

      case "ready":
        // Webview is initialized — check provider availability
        await this.onWebviewReady();
        break;

      case "cancelRequest":
        // Future: Implement request cancellation
        break;
    }
  }

  /**
   * Called when the webview signals it's ready.
   * Check provider connectivity and notify if there's an issue.
   */
  private async onWebviewReady(): Promise<void> {
    const status = await this.chatController.checkProvider();
    if (!status.available && status.error) {
      this.postMessageToWebview({
        type: "error",
        error: status.error,
      });
    }
  }

  /**
   * Send a message to the webview.
   */
  private postMessageToWebview(message: ExtensionMessage): void {
    if (this.view) {
      this.view.webview.postMessage(message);
    }
  }

  /**
   * Programmatically clear chat (e.g., from a command).
   */
  public clearChat(): void {
    this.chatController.clearChat((msg) => this.postMessageToWebview(msg));
  }

  /**
   * Ensure the chat panel is visible.
   */
  public reveal(): void {
    if (this.view) {
      this.view.show(true);
    }
  }

  dispose(): void {
    this.chatController.dispose();
  }
}
