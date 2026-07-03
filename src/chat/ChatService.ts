import { LLMProvider } from "../llm/LLMProvider";
import { LLMMessage, LLMStreamChunk } from "../llm/LLMTypes";
import { GreedantConfig } from "../config/GreedantConfig";
import { ChatMessage } from "./ChatTypes";

/**
 * ChatService orchestrates the chat flow between the user, conversation
 * history, and the active LLM provider.
 *
 * This service is provider-agnostic — it works with any LLMProvider
 * implementation and manages the conversation state.
 *
 * Future extensions:
 * - Context enrichment (inject active file, selected text, workspace info)
 * - Tool calling pipeline (detect tool calls, execute, return results)
 * - RAG integration (retrieve relevant code/docs before generating)
 * - Conversation branching and forking
 * - Multi-step agent workflows
 * - Response post-processing (code extraction, diff generation)
 * - Memory and persistence across sessions
 * - Cancellation token support
 */
export class ChatService {
  private provider: LLMProvider;
  private config: GreedantConfig;
  private conversationHistory: LLMMessage[] = [];

  constructor(provider: LLMProvider, config: GreedantConfig) {
    this.provider = provider;
    this.config = config;
  }

  /**
   * Send a user message and get a complete response.
   */
  async sendMessage(userMessage: string): Promise<string> {
    // Build the full message list with system prompt
    this.conversationHistory.push({ role: "user", content: userMessage });
    const messages = this.buildMessages();

    const response = await this.provider.chat({ messages });

    // Store assistant response in history
    this.conversationHistory.push({ role: "assistant", content: response.content });

    return response.content;
  }

  /**
   * Send a user message and stream the response chunk by chunk.
   */
  async *sendMessageStreaming(
    userMessage: string
  ): AsyncGenerator<LLMStreamChunk, void, unknown> {
    this.conversationHistory.push({ role: "user", content: userMessage });
    const messages = this.buildMessages();

    let fullResponse = "";

    for await (const chunk of this.provider.streamChat({ messages })) {
      fullResponse += chunk.content;
      yield chunk;
    }

    // Store complete assistant response in history
    this.conversationHistory.push({ role: "assistant", content: fullResponse });
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
   * Remove the last assistant message from history.
   * Useful for retry/regenerate functionality.
   */
  undoLastResponse(): void {
    if (
      this.conversationHistory.length > 0 &&
      this.conversationHistory[this.conversationHistory.length - 1].role === "assistant"
    ) {
      this.conversationHistory.pop();
    }
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
    const systemPrompt = this.config.systemPrompt;
    const messages: LLMMessage[] = [
      { role: "system", content: systemPrompt },
      ...this.conversationHistory,
    ];

    // Future: Inject context here
    // - Active file content
    // - Selected text
    // - Relevant workspace files (RAG)
    // - Tool definitions
    // - Previous tool results

    return messages;
  }

  dispose(): void {
    this.provider.dispose();
  }
}
