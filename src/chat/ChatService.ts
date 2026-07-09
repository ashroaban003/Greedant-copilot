import { LLMProvider } from "../llm/LLMProvider";
import { LLMMessage, LLMStreamChunk } from "../llm/LLMTypes";
import { ChatConfig } from "../config/ChatConfig";
import { ChatRole } from "./ChatMessage";

/**
 * ChatService orchestrates the chat flow between the user, conversation
 * history, and the active LLM provider.
 *
 * This service is provider-agnostic — it works with any LLMProvider
 * implementation and manages the conversation state.
 */
export class ChatService {
  private provider: LLMProvider;
  private config: ChatConfig;
  private conversationHistory: LLMMessage[] = [];

  /** Maximum number of messages to retain in history (user + assistant pairs) */
  private static readonly MAX_HISTORY_MESSAGES = 50;

  constructor(provider: LLMProvider, config: ChatConfig) {
    this.provider = provider;
    this.config = config;
  }

  /**
   * Add a user prompt to the conversation history.
   */
  addUserPrompt(content: string): void {
    this.addToHistory(ChatRole.User, content);
  }

  /**
   * Stream the assistant response chunk by chunk.
   * Does NOT add the user message to history — caller must call addUserPrompt first.
   */
  async *sendMessageStreaming(
    userMessage: string
  ): AsyncGenerator<LLMStreamChunk, void, unknown> {
    const messages = this.buildMessages();

    let fullResponse = "";

    for await (const chunk of this.provider.streamChat({ messages })) {
      fullResponse += chunk.content;
      yield chunk;
    }

    this.addToHistory(ChatRole.Assistant, fullResponse);
  }

  /**
   * Check if the underlying provider is available.
   */
  async checkAvailability(): Promise<{ available: boolean; error?: string }> {
    const status = await this.provider.isAvailable();
    return { available: status.available, error: status.error };
  }

  /**
   * Clear the conversation history.
   */
  clearHistory(): void {
    this.conversationHistory = [];
  }

  /**
   * Get the current conversation history (for persistence/display).
   */
  getHistory(): LLMMessage[] {
    return [...this.conversationHistory];
  }

  /**
   * Swap the active LLM provider (e.g., when user changes settings).
   */
  setProvider(provider: LLMProvider): void {
    this.provider.dispose();
    this.provider = provider;
  }

  /**
   * Build the full message array including system prompt.
   */
  private buildMessages(): LLMMessage[] {
    return [
      { role: "system", content: this.config.systemPrompt },
      ...this.conversationHistory,
    ];
  }

  /**
   * Add a message to history and trim if needed.
   */
  private addToHistory(role: ChatRole, content: string): void {
    this.conversationHistory.push({ role, content });
    this.trimHistory();
  }

  /**
   * Trim conversation history to MAX_HISTORY_MESSAGES.
   * Keeps the most recent messages (end of array) and drops the oldest (start of array).
   * Example: if MAX is 50 and length is 60, slice(10) keeps indices 10–59 (newest 50).
   */
  private trimHistory(): void {
    if (this.conversationHistory.length > ChatService.MAX_HISTORY_MESSAGES) {
      this.conversationHistory = this.conversationHistory.slice(
        this.conversationHistory.length - ChatService.MAX_HISTORY_MESSAGES
      );
    }
  }

  dispose(): void {
    this.provider.dispose();
  }
}
