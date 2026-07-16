import { LLMProvider } from "../llm/LLMProvider";
import { LLMMessage, LLMStreamChunk } from "../llm/LLMTypes";
import { ChatConfig } from "../config/ChatConfig";
import { ChatRole } from "./ChatMessage";
import { ContextManager } from "../context/ContextManager";

/**
 * ChatService orchestrates the chat flow between the user and the LLM provider.
 *
 * This service is provider-agnostic — it works with any LLMProvider implementation.
 *
 * Single-Turn Mode:
 * - Only sends system prompt + current user message to LLM (no history)
 * - Conversation history is retained locally for user reference
 *
 * Context Integration:
 * - Gathers editor context (selection or cursor line) before each message
 * - Enhances system prompt with code context
 */
export class ChatService {
  private provider: LLMProvider;
  private config: ChatConfig;
  private contextManager: ContextManager;
  private conversationHistory: LLMMessage[] = [];

  /** Maximum messages to retain in history */
  private static readonly MAX_HISTORY_MESSAGES = 50;

  constructor(
    provider: LLMProvider,
    config: ChatConfig,
    contextManager: ContextManager
  ) {
    this.provider = provider;
    this.config = config;
    this.contextManager = contextManager;
  }

  /**
   * Add a user prompt to conversation history.
   */
  addUserPrompt(content: string): void {
    this.addToHistory(ChatRole.User, content);
  }

  /**
   * Stream the assistant response chunk by chunk.
   * Single-turn mode: only sends system prompt + current user message to LLM.
   * History is stored locally but NOT sent to LLM.
   */
  async *sendMessageStreaming(
    userMessage: string
  ): AsyncGenerator<LLMStreamChunk, void, unknown> {
    const messages = this.buildMessages(userMessage);

    let fullResponse = "";

    for await (const chunk of this.provider.streamChat({ messages })) {
      fullResponse += chunk.content;
      yield chunk;
    }

    // Store assistant response in local history
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
   * Get the current conversation history.
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
   * Build messages for single-turn request.
   * Only sends: system prompt (with context) + current user message.
   * History is NOT sent to LLM.
   */
  private buildMessages(userMessage: string): LLMMessage[] {
    const systemPrompt = this.contextManager.buildPromptWithContext(
      this.config.systemPrompt
    );

    return [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
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
   * Trim history to MAX_HISTORY_MESSAGES.
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
