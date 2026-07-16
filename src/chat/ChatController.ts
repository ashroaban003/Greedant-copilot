import * as vscode from "vscode";
import { ChatService } from "./ChatService";
import { ChatMessage, ChatRole } from "./ChatMessage";
import { ExtensionMessage, MSG } from "./MessageProtocol";
import { ChatConfig } from "../config/ChatConfig";
import { CONFIG_SECTION, CONFIG_OLLAMA_MODEL } from "../constants";

/**
 * ChatController manages the lifecycle of chat requests.
 *
 * It bridges the webview (UI) and the ChatService (business logic),
 * handling user input, streaming responses back to the UI, and
 * managing loading/error states.
 */
export class ChatController {
  private chatService: ChatService;
  private config: ChatConfig;
  private activeRequests = new Map<string, boolean>();
  private messageCounter = 0;

  constructor(chatService: ChatService, config: ChatConfig) {
    this.chatService = chatService;
    this.config = config;
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
   * Fetch available models and determine the active model.
   * Applies fallback logic: if configured model isn't in the list, use first available.
   */
  async handleModelListRequest(
    postMessage: (message: ExtensionMessage) => void
  ): Promise<void> {
    const models = await this.getModelList();
    const activeModel = await this.resolveActiveModel(models);
    postMessage({ type: MSG.MODEL_LIST, models, activeModel });
  }

  /**
   * Handle model selection from the webview.
   * Persists the choice to VS Code workspace configuration.
   * The UI updates optimistically, no response needed.
   */
  async handleModelSelection(
    model: string,
    _postMessage: (message: ExtensionMessage) => void
  ): Promise<void> {
    await this.updateModelConfig(model);
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
   * Fetch models from the provider via ChatService.
   */
  private async getModelList(): Promise<string[]> {
    return this.chatService.listModels();
  }

  /**
   * Resolve the active model using fallback logic:
   * 1. If models list is empty, returns empty string (no models available)
   * 2. If configured model is in the list, use it
   * 3. Otherwise, fallback to first model and persist
   */
  private async resolveActiveModel(models: string[]): Promise<string> {
    if (models.length === 0) {
      return "";
    }
    const configured = this.config.ollamaModel;
    if (models.includes(configured)) {
      return configured;
    }
    const fallback = models[0];
    await this.updateModelConfig(fallback);
    return fallback;
  }

  /**
   * Write the selected model to VS Code workspace configuration.
   */
  private async updateModelConfig(model: string): Promise<void> {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    await config.update(CONFIG_OLLAMA_MODEL, model, vscode.ConfigurationTarget.Workspace);
  }

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
