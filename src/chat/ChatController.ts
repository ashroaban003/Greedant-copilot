import { ChatService } from "./ChatService";
import { ChatMessage, ChatRole } from "./ChatMessage";
import { ExtensionMessage, MSG } from "./MessageProtocol";

/**
 * ChatController manages the lifecycle of chat requests.
 *
 * It bridges the webview (UI) and the ChatService (business logic),
 * handling user input, streaming responses back to the UI, and
 * managing loading/error states.
 */
export class ChatController {
  private chatService: ChatService;
  private activeRequests = new Map<string, boolean>();
  private messageCounter = 0;

  constructor(chatService: ChatService) {
    this.chatService = chatService;
  }

  /**
   * Handle an incoming user message.
   * Streams the response back via the postMessage callback.
   *
   * Each session (identified by sessionId) can process independently,
   * supporting multiple live windows without blocking each other.
   */
  async handleUserMessage(
    content: string,
    postMessage: (message: ExtensionMessage) => void,
    sessionId: string = "default"
  ): Promise<void> {
    if (this.activeRequests.get(sessionId)) {
      postMessage({
        type: MSG.ERROR,
        error: "A request is already in progress. Please wait.",
      });
      return;
    }

    if (!content.trim()) {
      return;
    }

    this.activeRequests.set(sessionId, true);

    try {
      postMessage({ type: MSG.SET_LOADING, loading: true });

      this.processUserMessage(content.trim(), postMessage);
      await this.processAssistantMessage(content.trim(), postMessage);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred.";

      postMessage({ type: MSG.ERROR, error: errorMessage });
    } finally {
      this.activeRequests.delete(sessionId);
      postMessage({ type: MSG.SET_LOADING, loading: false });
    }
  }

  /**
   * Clear the chat history and notify the webview.
   */
  clearChat(postMessage: (message: ExtensionMessage) => void): void {
    this.chatService.clearHistory();
    postMessage({ type: MSG.CLEAR_CHAT });
  }

  /**
   * Check provider availability.
   */
  async checkProvider(): Promise<{ available: boolean; error?: string }> {
    return this.chatService.checkAvailability();
  }

  /**
   * Whether any session currently has a request in progress.
   */
  get busy(): boolean {
    return this.activeRequests.size > 0;
  }

  /**
   * Whether a specific session has a request in progress.
   */
  isSessionBusy(sessionId: string): boolean {
    return this.activeRequests.get(sessionId) ?? false;
  }

  // ─── Private helpers ───────────────────────────────────────────

  /**
   * Send the user message to the webview for display and add to history.
   */
  private processUserMessage(
    content: string,
    postMessage: (message: ExtensionMessage) => void
  ): void {
    const userMessage: ChatMessage = {
      id: this.generateMessageId(),
      role: ChatRole.User,
      content,
      timestamp: Date.now(),
    };
    postMessage({ type: MSG.RECEIVE_MESSAGE, message: userMessage });

    this.chatService.addUserPrompt(content);
  }

  /**
   * Stream the assistant response: sends placeholder, streams chunks, signals end.
   */
  private async processAssistantMessage(
    userContent: string,
    postMessage: (message: ExtensionMessage) => void
  ): Promise<void> {
    const id = this.generateMessageId();
    const assistantMessage: ChatMessage = {
      id,
      role: ChatRole.Assistant,
      content: "",
      timestamp: Date.now(),
      isStreaming: true,
    };
    postMessage({ type: MSG.RECEIVE_MESSAGE, message: assistantMessage });

    for await (const chunk of this.chatService.sendMessageStreaming(userContent)) {
      postMessage({
        type: MSG.STREAM_CHUNK,
        messageId: id,
        content: chunk.content,
      });
    }
    postMessage({ type: MSG.STREAM_END, messageId: id });
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${++this.messageCounter}`;
  }

  dispose(): void {
    this.chatService.dispose();
  }
}
