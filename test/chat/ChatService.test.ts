import { ChatService } from "../../src/chat/ChatService";
import { LLMProvider } from "../../src/llm/LLMProvider";
import {
  LLMRequest,
  LLMStreamChunk,
  FinishReason,
} from "../../src/llm/LLMTypes";
import { ChatConfig } from "../../src/config/ChatConfig";
import { ContextManager } from "../../src/context/ContextManager";
import { SelectionProvider } from "../../src/context/providers/SelectionProvider";

// ─── Helpers ─────────────────────────────────────────────────────

function createMockProvider(overrides: Partial<LLMProvider> = {}): LLMProvider {
  return {
    name: "test-provider",
    chat: jest.fn(async () => ({
      content: "mock response",
      model: "test",
      finishReason: FinishReason.Stop,
    })),
    streamChat: jest.fn(async function* () {
      yield { content: "chunk1", done: false };
      yield { content: "chunk2", done: true };
    }),
    isAvailable: jest.fn(async () => ({
      available: true,
      provider: "test-provider",
      model: "test",
    })),
    dispose: jest.fn(),
    ...overrides,
  };
}

function createMockConfig(): ChatConfig {
  return {
    provider: "ollama",
    ollamaBaseUrl: "http://localhost:11434",
    ollamaModel: "test-model",
    systemPrompt: "You are a test assistant.",
  } as unknown as ChatConfig;
}

function createMockContextManager(context: string | null = null): ContextManager {
  const mockSelectionProvider = {
    getContext: jest.fn(() => context),
  } as unknown as SelectionProvider;
  return new ContextManager(mockSelectionProvider);
}

// ─── Tests ───────────────────────────────────────────────────────

describe("ChatService", () => {
  let service: ChatService;
  let mockProvider: LLMProvider;
  let mockConfig: ChatConfig;
  let mockContextManager: ContextManager;

  beforeEach(() => {
    mockProvider = createMockProvider();
    mockConfig = createMockConfig();
    mockContextManager = createMockContextManager();
    service = new ChatService(mockProvider, mockConfig, mockContextManager);
  });

  describe("sendMessageStreaming", () => {
    it("yields all chunks from the provider", async () => {
      const chunks: LLMStreamChunk[] = [];
      for await (const chunk of service.sendMessageStreaming("test")) {
        chunks.push(chunk);
      }
      expect(chunks).toHaveLength(2);
      expect(chunks[0].content).toBe("chunk1");
      expect(chunks[1].content).toBe("chunk2");
    });

    it("adds user message and concatenated response to history", async () => {
      service.addUserPrompt("stream test");
      for await (const _ of service.sendMessageStreaming("stream test")) {
        // consume
      }
      const history = service.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0]).toEqual({ role: "user", content: "stream test" });
      expect(history[1]).toEqual({ role: "assistant", content: "chunk1chunk2" });
    });

    it("includes system prompt with instructions in messages sent to provider", async () => {
      for await (const _ of service.sendMessageStreaming("hi")) {
        // consume
      }
      const call = (mockProvider.streamChat as jest.Mock).mock.calls[0][0] as LLMRequest;
      expect(call.messages[0].role).toBe("system");
      expect(call.messages[0].content).toContain("You are a test assistant.");
      expect(call.messages[0].content).toContain("## Instructions");
    });

    it("includes conversation history in subsequent calls", async () => {
      service.addUserPrompt("first");
      for await (const _ of service.sendMessageStreaming("first")) {}
      service.addUserPrompt("second");
      for await (const _ of service.sendMessageStreaming("second")) {}

      const call = (mockProvider.streamChat as jest.Mock).mock.calls[1][0] as LLMRequest;
      // system + user (single-turn mode only sends system + current user)
      expect(call.messages).toHaveLength(2);
      expect(call.messages[0].role).toBe("system");
      expect(call.messages[1]).toEqual({ role: "user", content: "second" });
    });

    it("propagates provider stream errors", async () => {
      const errorProvider = createMockProvider({
        streamChat: jest.fn(async function* () {
          yield { content: "partial", done: false };
          throw new Error("stream broken");
        }),
      });
      const errorService = new ChatService(errorProvider, mockConfig, mockContextManager);

      const chunks: LLMStreamChunk[] = [];
      await expect(async () => {
        for await (const chunk of errorService.sendMessageStreaming("hi")) {
          chunks.push(chunk);
        }
      }).rejects.toThrow("stream broken");
      expect(chunks).toHaveLength(1);
    });

    it("includes selection context in system prompt when available", async () => {
      const contextWithSelection = createMockContextManager("# Selected Code\nconst x = 1;");
      const serviceWithContext = new ChatService(mockProvider, mockConfig, contextWithSelection);

      for await (const _ of serviceWithContext.sendMessageStreaming("explain")) {
        // consume
      }

      const call = (mockProvider.streamChat as jest.Mock).mock.calls[0][0] as LLMRequest;
      expect(call.messages[0].content).toContain("# Selected Code");
      expect(call.messages[0].content).toContain("const x = 1;");
    });
  });

  describe("checkAvailability", () => {
    it("returns available status from provider", async () => {
      const result = await service.checkAvailability();
      expect(result).toEqual({ available: true, error: undefined });
    });

    it("returns error when provider is unavailable", async () => {
      const unavailable = createMockProvider({
        isAvailable: jest.fn(async () => ({
          available: false,
          provider: "test",
          error: "cannot connect",
        })),
      });
      const svc = new ChatService(unavailable, mockConfig, mockContextManager);
      const result = await svc.checkAvailability();
      expect(result.available).toBe(false);
      expect(result.error).toBe("cannot connect");
    });
  });

  describe("clearHistory", () => {
    it("empties the conversation history", async () => {
      for await (const _ of service.sendMessageStreaming("msg")) {}
      expect(service.getHistory().length).toBeGreaterThan(0);

      service.clearHistory();
      expect(service.getHistory()).toHaveLength(0);
    });
  });

  describe("getHistory", () => {
    it("returns a copy (not a reference) of history", async () => {
      service.addUserPrompt("test");
      for await (const _ of service.sendMessageStreaming("test")) {}
      const history = service.getHistory();
      history.push({ role: "assistant", content: "injected" });
      expect(service.getHistory()).toHaveLength(2);
    });
  });

  describe("setProvider", () => {
    it("disposes old provider and switches to new one", async () => {
      const newProvider = createMockProvider({
        streamChat: jest.fn(async function* () {
          yield { content: "new response", done: true };
        }),
      });

      service.setProvider(newProvider);
      expect(mockProvider.dispose).toHaveBeenCalled();

      const chunks: LLMStreamChunk[] = [];
      for await (const chunk of service.sendMessageStreaming("hi")) {
        chunks.push(chunk);
      }
      expect(chunks[0].content).toBe("new response");
    });
  });

  describe("dispose", () => {
    it("disposes the provider", () => {
      service.dispose();
      expect(mockProvider.dispose).toHaveBeenCalled();
    });
  });
});
