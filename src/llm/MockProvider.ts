import { LLMProvider } from "./LLMProvider";
import { LLMRequest, LLMResponse, LLMStreamChunk, ProviderStatus } from "./LLMTypes";

/**
 * Mock LLM provider for UI development and testing.
 * Simulates streaming responses with realistic delays.
 */
export class MockProvider implements LLMProvider {
  readonly name = "mock";

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const response = this.pickResponse(request.messages[request.messages.length - 1]?.content || "");
    await this.delay(300);
    return { content: response, model: "mock", finishReason: "stop" };
  }

  async *streamChat(request: LLMRequest): AsyncGenerator<LLMStreamChunk, void, unknown> {
    const userMsg = request.messages[request.messages.length - 1]?.content || "";
    const response = this.pickResponse(userMsg);
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

  dispose(): void {}

  private pickResponse(input: string): string {
    const lower = input.toLowerCase();

    if (lower.includes("hello") || lower.includes("hi")) {
      return "Hey! I'm Greedant, your local AI coding assistant. How can I help you today?";
    }

    if (lower.includes("async") || lower.includes("await")) {
      return "In JavaScript, `async/await` is syntactic sugar over Promises.\n\nAn `async` function always returns a Promise. The `await` keyword pauses execution until the Promise resolves:\n\n```javascript\nasync function fetchData() {\n  const response = await fetch('/api/data');\n  const data = await response.json();\n  return data;\n}\n```\n\nIt makes asynchronous code read like synchronous code, which is much easier to follow.";
    }

    if (lower.includes("solid")) {
      return "The SOLID principles are:\n\n**S** — Single Responsibility: A class should have one reason to change.\n\n**O** — Open/Closed: Open for extension, closed for modification.\n\n**L** — Liskov Substitution: Subtypes must be substitutable for their base types.\n\n**I** — Interface Segregation: Prefer small, specific interfaces over large general ones.\n\n**D** — Dependency Inversion: Depend on abstractions, not concretions.";
    }

    if (lower.includes("duplicate") || lower.includes("python")) {
      return "Here's a clean way to find duplicates in a Python list:\n\n```python\ndef find_duplicates(items):\n    seen = set()\n    duplicates = set()\n    for item in items:\n        if item in seen:\n            duplicates.add(item)\n        seen.add(item)\n    return list(duplicates)\n```\n\nThis runs in O(n) time using sets for fast lookups.";
    }

    return "I can help with that. Could you give me a bit more context about what you're working on? I'm good with code explanations, debugging, writing functions, and general programming questions.";
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
