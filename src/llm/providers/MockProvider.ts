import { LLMProvider } from "../LLMProvider";
import { LLMRequest, LLMResponse, LLMStreamChunk, ProviderStatus, FinishReason } from "../LLMTypes";

/** Characters per token ratio for estimation */
const CHARS_PER_TOKEN = 3.4;

/**
 * Mock LLM provider for UI development and testing.
 * Simulates streaming responses with realistic delays.
 */
export class MockProvider implements LLMProvider {
  readonly name = "mock";

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const systemPrompt = request.messages.find(m => m.role === "system")?.content || "";
    
    // Check if this is a keyword extraction request
    if (this.isKeywordExtractionRequest(systemPrompt)) {
      const response = this.generateKeywordExtractionResponse(request);
      await this.delay(200);
      return { content: response, model: "mock", finishReason: FinishReason.Stop };
    }

    // Regular chat request - return debug info
    const response = this.formatDebugResponse(request);
    await this.delay(300);
    return { content: response, model: "mock", finishReason: FinishReason.Stop };
  }

  async *streamChat(request: LLMRequest): AsyncGenerator<LLMStreamChunk, void, unknown> {
    const userMessage = request.messages.find(m => m.role === "user")?.content || "";
    
    // Check for terminal test trigger
    const response = this.isTerminalTestRequest(userMessage)
      ? this.getTerminalTestResponse()
      : this.formatDebugResponse(request);
    
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

  async getContextWindowSize(): Promise<number> {
    return 4096;
  }

  dispose(): void {}

  private isKeywordExtractionRequest(systemPrompt: string): boolean {
    return systemPrompt.includes("Extract keywords") || 
           systemPrompt.includes("LIST1") ||
           systemPrompt.includes("code analysis assistant");
  }

  /**
   * Generate mock keyword extraction response.
   */
  private generateKeywordExtractionResponse(request: LLMRequest): string {
    const userPrompt = request.messages.find(m => m.role === "user")?.content || "";
    
    // Extract initial keywords from prompt
    const keywordsMatch = userPrompt.match(/INITIAL KEYWORDS[^:]*:\s*([^\n]+)/i);
    const initialKeywords = keywordsMatch 
      ? keywordsMatch[1].split(",").map(k => k.trim()).filter(k => k.length > 0)
      : [];

    // Extract code snippets to find identifiers
    const codeSnippetMatch = userPrompt.match(/```\n([\s\S]*?)```/);
    const codeSnippet = codeSnippetMatch ? codeSnippetMatch[1] : "";
    const codeIdentifiers = this.extractIdentifiersFromCode(codeSnippet);

    // Build list1: Use initial keywords + code identifiers
    const list1: string[] = [];
    for (const kw of initialKeywords.slice(0, 4)) {
      const corrected = this.findSimilarIdentifier(kw, codeIdentifiers);
      list1.push(corrected || kw);
    }
    for (const id of codeIdentifiers.slice(0, 3)) {
      if (!list1.includes(id)) list1.push(id);
    }

    // Build list2: Split camelCase parts + semantic keywords
    const list2: Array<{ keyword: string; score: number }> = [];
    const used = new Set(list1.map(k => k.toLowerCase()));
    
    for (const id of list1.slice(0, 2)) {
      for (const part of this.splitCamelCase(id)) {
        if (!used.has(part.toLowerCase())) {
          list2.push({ keyword: part, score: 70 + Math.floor(Math.random() * 20) });
          used.add(part.toLowerCase());
        }
      }
    }

    return JSON.stringify({
      list1: list1.slice(0, 7),
      list2: list2.slice(0, 9).sort((a, b) => b.score - a.score),
    }, null, 2);
  }

  private extractIdentifiersFromCode(code: string): string[] {
    const identifiers: string[] = [];
    const regex = /(?:class|interface|function|const|let|var)\s+([A-Z][a-zA-Z0-9_]*)/g;
    let match;
    while ((match = regex.exec(code)) !== null) {
      if (!identifiers.includes(match[1])) identifiers.push(match[1]);
    }
    return identifiers;
  }

  private findSimilarIdentifier(input: string, candidates: string[]): string | null {
    const inputLower = input.toLowerCase();
    for (const c of candidates) {
      if (c.toLowerCase() === inputLower) return c;
      if (c.toLowerCase().includes(inputLower) || inputLower.includes(c.toLowerCase())) return c;
    }
    return null;
  }

  private splitCamelCase(str: string): string[] {
    return str.replace(/([a-z])([A-Z])/g, "$1 $2").split(/\s+/).filter(s => s.length >= 3);
  }

  private formatDebugResponse(request: LLMRequest): string {
    const lines: string[] = [];
    lines.push("## Debug: Full Prompt Sent to LLM\n");
    lines.push(`**Model context window:** 4096 tokens`);
    lines.push(`**Total messages:** ${request.messages.length}\n`);

    for (let i = 0; i < request.messages.length; i++) {
      const msg = request.messages[i];
      const estimatedTokens = Math.ceil(msg.content.length / CHARS_PER_TOKEN);
      lines.push(`### Message ${i + 1} — ${msg.role} (~${estimatedTokens} tokens)\n`);
      lines.push("```");
      lines.push(msg.content);
      lines.push("```\n");
    }

    const totalChars = request.messages.reduce((sum, m) => sum + m.content.length, 0);
    const totalTokens = Math.ceil(totalChars / CHARS_PER_TOKEN);
    lines.push(`---`);
    lines.push(`**Total prompt tokens (estimated):** ~${totalTokens}`);
    lines.push(`**Remaining for response:** ~${4096 - totalTokens}`);

    return lines.join("\n");
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isTerminalTestRequest(userMessage: string): boolean {
    const lower = userMessage.toLowerCase();
    return lower.includes("give prompt") || lower.includes("test terminal");
  }

  private getTerminalTestResponse(): string {
    return `Here are some useful git commands to check your repository status:

\`\`\`bash
git status
\`\`\`

To see recent commits:

\`\`\`bash
git log --oneline -5
\`\`\`

Check which branch you're on:

\`\`\`bash
git branch
\`\`\`

These commands are read-only and won't modify anything.`;
  }
}
