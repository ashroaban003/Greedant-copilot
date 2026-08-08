import { LLMProvider } from "../llm/LLMProvider";
import { LLMMessage, LLMStreamChunk } from "../llm/LLMTypes";
import { ChatConfig } from "../config/ChatConfig";
import { ChatRole } from "./ChatMessage";
import { ContextManager } from "../context/ContextManager";

/**
 * ChatService orchestrates the chat flow between the user and the LLM provider.
 * This service is provider-agnostic — it works with any LLMProvider implementation.
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

  async fetchAndSetContextWindow(model?: string): Promise<void> {
    if (this.provider.getContextWindowSize) {
      const size = await this.provider.getContextWindowSize(model);
      if (size) {
        this.contextManager.setContextWindow(size);
      }
    }
  }

  addUserPrompt(content: string): void {
    this.addToHistory(ChatRole.User, content);
  }

  /**
   * Stream the assistant response chunk by chunk.
   */
  async *sendMessageStreaming(
    userMessage: string
  ): AsyncGenerator<LLMStreamChunk, void, unknown> {
    const messages = await this.buildMessages(userMessage);

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
   * Get the current conversation history.
   */
  getHistory(): LLMMessage[] {
    return [...this.conversationHistory];
  }

  /**
   * List available models from the underlying provider.
   */
  async listModels(): Promise<string[]> {
    if (this.provider.listModels) {
      return this.provider.listModels();
    }
    return [];
  }

  /**
   * Swap the active LLM provider (e.g., when user changes settings).
   */
  setProvider(provider: LLMProvider): void {
    this.provider.dispose();
    this.provider = provider;
  }

  /**
   * Get the last user+assistant message pair from history.
   * Truncates the assistant response to avoid bloating context.
   */
  private getLastConversationPair(): { user: string; assistant: string } | null {
    const history = this.conversationHistory;
    if (history.length < 2) {
      return null;
    }

    // Find the last assistant message and the user message before it
    for (let i = history.length - 1; i >= 1; i--) {
      if (history[i].role === "assistant" && history[i - 1].role === "user") {
        const assistantContent = history[i].content;
        const maxLength = 1690;
        const truncatedAssistant = assistantContent.length > maxLength
          ? assistantContent.slice(0, maxLength) + "..."
          : assistantContent;

        return {
          user: history[i - 1].content,
          assistant: truncatedAssistant,
        };
      }
    }

    return null;
  }

  private async buildMessages(userMessage: string): Promise<LLMMessage[]> {
    let systemPrompt: string;
    const lastPair = this.getLastConversationPair();

    try {
      systemPrompt = await this.contextManager.buildPromptWithContext(
        this.config.systemPrompt,
        userMessage,
        lastPair?.assistant ?? null,
        lastPair?.user ?? null
      );
    } catch {
      // Context gathering failed — fall back to basic prompt
      systemPrompt = this.contextManager.buildPromptWithDefaultContext(
        this.config.systemPrompt
      );
    }

    // Prepend previous conversation context to system prompt if available
    if (lastPair) {
      const conversationContext = `## Previous Conversation (for continuity)
User: ${lastPair.user}
Assistant: ${lastPair.assistant}

---

`;
      systemPrompt = conversationContext + systemPrompt;
    }

    return [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ];
  }

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
