import { MockProvider } from "../../src/llm/providers/MockProvider";
import { LLMRequest, LLMStreamChunk, FinishReason } from "../../src/llm/LLMTypes";

describe("MockProvider", () => {
  let provider: MockProvider;

  beforeEach(() => {
    provider = new MockProvider();
  });

  describe("name", () => {
    it("is 'mock'", () => {
      expect(provider.name).toBe("mock");
    });
  });

  describe("chat", () => {
    it("returns a response with finishReason Stop", async () => {
      const request: LLMRequest = {
        messages: [{ role: "user", content: "hello" }],
      };
      const response = await provider.chat(request);
      expect(response.model).toBe("mock");
      expect(response.finishReason).toBe(FinishReason.Stop);
      expect(response.content.length).toBeGreaterThan(0);
    });

    it("returns debug response showing the full prompt", async () => {
      const request: LLMRequest = {
        messages: [{ role: "user", content: "hello there" }],
      };
      const response = await provider.chat(request);
      expect(response.content).toContain("Debug: Full Prompt");
      expect(response.content).toContain("hello there");
    });

    it("shows message count in debug response", async () => {
      const request: LLMRequest = {
        messages: [
          { role: "system", content: "You are helpful" },
          { role: "user", content: "explain async await" },
        ],
      };
      const response = await provider.chat(request);
      expect(response.content).toContain("Total messages:** 2");
    });

    it("handles empty messages gracefully", async () => {
      const request: LLMRequest = { messages: [] };
      const response = await provider.chat(request);
      expect(response.content.length).toBeGreaterThan(0);
    });

    it("returns JSON for keyword extraction requests", async () => {
      const request: LLMRequest = {
        messages: [
          { role: "system", content: "You are a code analysis assistant. Extract keywords..." },
          { role: "user", content: "USER QUERY: how to fix the error\n\nINITIAL KEYWORDS: error, fix\n\nRELEVANT CODE SNIPPETS:\n```\nclass ErrorHandler {}\n```" },
        ],
      };
      const response = await provider.chat(request);
      const parsed = JSON.parse(response.content);
      expect(parsed).toHaveProperty("list1");
      expect(parsed).toHaveProperty("list2");
    });
  });

  describe("streamChat", () => {
    it("yields multiple chunks that ends with done=true", async () => {
      const request: LLMRequest = {
        messages: [{ role: "user", content: "hello" }],
      };

      const chunks: LLMStreamChunk[] = [];
      for await (const chunk of provider.streamChat(request)) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[chunks.length - 1].done).toBe(true);
    });

    it("non-final chunks have done=false", async () => {
      const request: LLMRequest = {
        messages: [{ role: "user", content: "solid" }],
      };

      const chunks: LLMStreamChunk[] = [];
      for await (const chunk of provider.streamChat(request)) {
        chunks.push(chunk);
      }

      const nonFinal = chunks.slice(0, -1);
      for (const chunk of nonFinal) {
        expect(chunk.done).toBe(false);
      }
    });

    it("concatenated chunks form the full response", async () => {
      const request: LLMRequest = {
        messages: [{ role: "user", content: "hello" }],
      };

      let full = "";
      for await (const chunk of provider.streamChat(request)) {
        full += chunk.content;
      }

      const chatResponse = await provider.chat(request);
      expect(full).toBe(chatResponse.content);
    });
  });

  describe("isAvailable", () => {
    it("always returns available", async () => {
      const status = await provider.isAvailable();
      expect(status.available).toBe(true);
      expect(status.provider).toBe("mock");
    });
  });

  describe("dispose", () => {
    it("does not throw", () => {
      expect(() => provider.dispose()).not.toThrow();
    });
  });
});
