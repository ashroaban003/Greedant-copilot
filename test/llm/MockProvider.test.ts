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

    it("responds to 'hello' with a greeting", async () => {
      const request: LLMRequest = {
        messages: [{ role: "user", content: "hello there" }],
      };
      const response = await provider.chat(request);
      expect(response.content.toLowerCase()).toContain("greedant");
    });

    it("responds to 'async' with explanation", async () => {
      const request: LLMRequest = {
        messages: [{ role: "user", content: "explain async await" }],
      };
      const response = await provider.chat(request);
      expect(response.content).toContain("async");
    });

    it("responds to unknown input with a generic response", async () => {
      const request: LLMRequest = {
        messages: [{ role: "user", content: "xyzzy" }],
      };
      const response = await provider.chat(request);
      expect(response.content).toContain("help");
    });

    it("handles empty messages gracefully", async () => {
      const request: LLMRequest = { messages: [] };
      const response = await provider.chat(request);
      expect(response.content.length).toBeGreaterThan(0);
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
