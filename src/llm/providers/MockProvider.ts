import { LLMProvider } from "../LLMProvider";
import { LLMRequest, LLMResponse, LLMStreamChunk, ProviderStatus, FinishReason, ModelInfo } from "../LLMTypes";

/**
 * Mock LLM provider for UI development and testing.
 * Simulates streaming responses with realistic delays.
 *
 * Debug Features:
 * - When user sends "debug context", returns the full system prompt
 *   (which includes gathered editor context) for testing
 */
export class MockProvider implements LLMProvider {
  readonly name = "mock";

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const response = this.pickResponse(request);
    await this.delay(300);
    return { content: response, model: "mock", finishReason: FinishReason.Stop };
  }

  async *streamChat(request: LLMRequest): AsyncGenerator<LLMStreamChunk, void, unknown> {
    const response = this.pickResponse(request);
    const words = response.split(" ");

    for (let i = 0; i < words.length; i++) {
      await this.delay(30 + Math.random() * 50);
      const content = (i === 0 ? "" : " ") + words[i];
      yield { content, done: false };
    }

    yield { content: "", done: true };
  }

  async isAvailable(): Promise<ProviderStatus> {
    return { available: true, provider: this.name, model: "mock" };
  }

  async listModels(): Promise<string[]> {
    return ["qwen2.5-coder:3b", "llama3:8b", "codellama:7b"];
  }

  async getModelInfo(): Promise<ModelInfo> {
    return { name: "mock", contextLength: 4096 };
  }

  dispose(): void {}

  private pickResponse(request: LLMRequest): string {
    // Always return the full prompt for debugging/testing context gathering
    return this.formatDebugResponse(request);
  }

  /**
   * Format debug response showing the full system prompt, context, and token budget.
   */
  private formatDebugResponse(request: LLMRequest): string {
    const lines: string[] = [];
    
    lines.push("## Debug: Full Prompt Sent to LLM\n");
    lines.push(`**Model context window:** 4096 tokens`);
    lines.push(`**Total messages:** ${request.messages.length}\n`);

    for (let i = 0; i < request.messages.length; i++) {
      const msg = request.messages[i];
      const estimatedTokens = Math.ceil(msg.content.length / 3.5);
      lines.push(`### Message ${i + 1} — ${msg.role} (~${estimatedTokens} tokens)\n`);
      lines.push("```");
      lines.push(msg.content);
      lines.push("```\n");
    }

    const totalChars = request.messages.reduce((sum, m) => sum + m.content.length, 0);
    const totalTokens = Math.ceil(totalChars / 3.5);
    lines.push(`---`);
    lines.push(`**Total prompt tokens (estimated):** ~${totalTokens}`);
    lines.push(`**Remaining for response:** ~${4096 - totalTokens}`);

    return lines.join("\n");
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
