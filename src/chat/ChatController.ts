import * as vscode from "vscode";
import { ChatService } from "./ChatService";
import { ChatMessage, ExtensionMessage } from "./ChatTypes";

/**
 * ChatController manages the lifecycle of chat requests.
 *
 * It bridges the webview (UI) and the ChatService (business logic),
 * handling user input, streaming responses back to the UI, and
 * managing loading/error states.
 *
 * Future extensions:
 * - Request cancellation via AbortController
 * - Request queuing (prevent concurrent requests)
 * - Rate limiting
 * - Retry logic with exponential backoff
 * - Multi-step agent orchestration
 * - Tool call execution loop
 * - Progress reporting for long operations
 */
export class ChatController {
  private chatService: ChatService;
  private isProcessing = false;
  private messageCounter = 0;

  constructor(chatService: ChatService) {
    this.chatService = chatService;
  }

  /**
   * Handle an incoming user message.
   * Streams the response back via the postMessage callback.
   */
  async handleUserMessage(
    content: string,
    postMessage: (message: ExtensionMessage) => void
  ): Promise<void> {
    if (this.isProcessing) {
      postMessage({
        type: "error",
        error: "A request is already in progress. Please wait.",
      });
      return;
    }

    if (!content.trim()) {
      return;
    }

    this.isProcessing = true;
    const assistantMessageId = this.generateMessageId();

    try {
      // Notify UI that we're processing
      postMessage({ type: "setLoading", loading: true });

      // Send the user message as a chat message to the webview
      const userMessage: ChatMessage = {
        id: this.generateMessageId(),
        role: "user",
        content: content.trim(),
        timestamp: Date.now(),
      };
      postMessage({ type: "receiveMessage", message: userMessage });

      // Create a placeholder assistant message
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        isStreaming: true,
      };
      postMessage({ type: "receiveMessage", message: assistantMessage });

      // Stream the response
      for await (const chunk of this.chatService.sendMessageStreaming(content.trim())) {
        postMessage({
          type: "streamChunk",
          messageId: assistantMessageId,
          content: chunk.content,
        });
      }

      // Signal stream completion
      postMessage({ type: "streamEnd", messageId: assistantMessageId });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred.";

      postMessage({
        type: "error",
        error: errorMessage,
      });

      // Remove the incomplete assistant message from history
      this.chatService.undoLastResponse();
    } finally {
      this.isProcessing = false;
      postMessage({ type: "setLoading", loading: false });
    }
  }

  /**
   * Clear the chat history and notify the webview.
   */
  clearChat(postMessage: (message: ExtensionMessage) => void): void {
    this.chatService.clearHistory();
    postMessage({ type: "clearChat" });
  }

  /**
   * Check provider availability.
   */
  async checkProvider(): Promise<{ available: boolean; error?: string }> {
    return this.chatService.checkAvailability();
  }

  /**
   * Whether a request is currently being processed.
   */
  get busy(): boolean {
    return this.isProcessing;
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${++this.messageCounter}`;
  }

  dispose(): void {
    this.chatService.dispose();
  }
}
