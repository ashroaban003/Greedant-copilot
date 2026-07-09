import { ChatController } from "../../src/chat/ChatController";
import { ChatService } from "../../src/chat/ChatService";
import { ExtensionMessage, MSG } from "../../src/chat/MessageProtocol";
import { LLMProvider } from "../../src/llm/LLMProvider";
import { FinishReason, LLMStreamChunk } from "../../src/llm/LLMTypes";
import { ChatConfig } from "../../src/config/ChatConfig";

// ─── Helpers ─────────────────────────────────────────────────────

function createMockProvider(overrides: Partial<LLMProvider> = {}): LLMProvider {
  return {
    name: "test",
    chat: jest.fn(async () => ({
      content: "response",
      model: "test",
      finishReason: FinishReason.Stop,
    })),
    streamChat: jest.fn(async function* () {
      yield { content: "hello ", done: false };
      yield { content: "world", done: true };
    }),
    isAvailable: jest.fn(async () => ({
      available: true,
      provider: "test",
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
    ollamaModel: "test",
    systemPrompt: "Test system prompt.",
  } as unknown as ChatConfig;
}

function createController(providerOverrides: Partial<LLMProvider> = {}) {
  const provider = createMockProvider(providerOverrides);
  const config = createMockConfig();
  const chatService = new ChatService(provider, config);
  const controller = new ChatController(chatService);
  return { controller, provider, chatService };
}

function collectMessages(
  fn: (postMessage: (msg: ExtensionMessage) => void) => Promise<void>
): Promise<ExtensionMessage[]> {
  const messages: ExtensionMessage[] = [];
  return fn((msg) => messages.push(msg)).then(() => messages);
}

// ─── Tests ───────────────────────────────────────────────────────

describe("ChatController", () => {
  describe("handleUserMessage", () => {
    it("streams response and sends correct message sequence", async () => {
      const { controller } = createController();
      const messages = await collectMessages((post) =>
        controller.handleUserMessage("hi", post)
      );

      const types = messages.map((m) => m.type);
      expect(types).toContain(MSG.SET_LOADING);
      expect(types).toContain(MSG.RECEIVE_MESSAGE);
      expect(types).toContain(MSG.STREAM_CHUNK);
      expect(types).toContain(MSG.STREAM_END);
    });

    it("sends setLoading true at start and false at end", async () => {
      const { controller } = createController();
      const messages = await collectMessages((post) =>
        controller.handleUserMessage("hi", post)
      );

      const loadingMessages = messages.filter(
        (m) => m.type === MSG.SET_LOADING
      ) as Array<{ type: typeof MSG.SET_LOADING; loading: boolean }>;

      expect(loadingMessages[0].loading).toBe(true);
      expect(loadingMessages[loadingMessages.length - 1].loading).toBe(false);
    });

    it("sends user message and assistant placeholder before streaming", async () => {
      const { controller } = createController();
      const messages = await collectMessages((post) =>
        controller.handleUserMessage("test input", post)
      );

      const receiveMessages = messages.filter(
        (m) => m.type === MSG.RECEIVE_MESSAGE
      ) as Array<{ type: typeof MSG.RECEIVE_MESSAGE; message: any }>;

      expect(receiveMessages).toHaveLength(2);
      expect(receiveMessages[0].message.role).toBe("user");
      expect(receiveMessages[0].message.content).toBe("test input");
      expect(receiveMessages[1].message.role).toBe("assistant");
      expect(receiveMessages[1].message.isStreaming).toBe(true);
    });

    it("rejects empty/whitespace-only messages silently", async () => {
      const { controller } = createController();
      const messages = await collectMessages((post) =>
        controller.handleUserMessage("   ", post)
      );
      expect(messages).toHaveLength(0);
    });

    it("rejects concurrent requests on the same session", async () => {
      const { controller } = createController({
        streamChat: jest.fn(async function* () {
          // Simulate slow response
          await new Promise((r) => setTimeout(r, 50));
          yield { content: "slow", done: true };
        }),
      });

      const messages1: ExtensionMessage[] = [];
      const messages2: ExtensionMessage[] = [];

      const p1 = controller.handleUserMessage("first", (m) => messages1.push(m));
      // Give p1 a tick to register as active
      await new Promise((r) => setTimeout(r, 5));
      const p2 = controller.handleUserMessage("second", (m) => messages2.push(m));

      await Promise.all([p1, p2]);

      const errorMsg = messages2.find(
        (m) => m.type === MSG.ERROR
      ) as { type: typeof MSG.ERROR; error: string } | undefined;

      expect(errorMsg).toBeDefined();
      expect(errorMsg!.error).toContain("already in progress");
    });

    it("allows concurrent requests on different sessions", async () => {
      const { controller } = createController({
        streamChat: jest.fn(async function* () {
          await new Promise((r) => setTimeout(r, 20));
          yield { content: "ok", done: true };
        }),
      });

      const messages1: ExtensionMessage[] = [];
      const messages2: ExtensionMessage[] = [];

      const p1 = controller.handleUserMessage("first", (m) => messages1.push(m), "session-a");
      const p2 = controller.handleUserMessage("second", (m) => messages2.push(m), "session-b");

      await Promise.all([p1, p2]);

      // Both should have stream end (no error blocking)
      const hasEnd1 = messages1.some((m) => m.type === MSG.STREAM_END);
      const hasEnd2 = messages2.some((m) => m.type === MSG.STREAM_END);
      expect(hasEnd1).toBe(true);
      expect(hasEnd2).toBe(true);
    });

    it("sends error message when provider throws", async () => {
      const { controller } = createController({
        streamChat: jest.fn(async function* () {
          throw new Error("provider down");
        }),
      });

      const messages = await collectMessages((post) =>
        controller.handleUserMessage("hi", post)
      );

      const errorMsg = messages.find(
        (m) => m.type === MSG.ERROR
      ) as { type: typeof MSG.ERROR; error: string } | undefined;

      expect(errorMsg).toBeDefined();
      expect(errorMsg!.error).toBe("provider down");
    });

    it("trims whitespace from user content", async () => {
      const { controller } = createController();
      const messages = await collectMessages((post) =>
        controller.handleUserMessage("  hello  ", post)
      );

      const receiveMessages = messages.filter(
        (m) => m.type === MSG.RECEIVE_MESSAGE
      ) as Array<{ type: typeof MSG.RECEIVE_MESSAGE; message: any }>;

      expect(receiveMessages[0].message.content).toBe("hello");
    });

    it("clears busy state after completion", async () => {
      const { controller } = createController();
      expect(controller.busy).toBe(false);

      await collectMessages((post) => controller.handleUserMessage("hi", post));
      expect(controller.busy).toBe(false);
    });

    it("clears busy state even on error", async () => {
      const { controller } = createController({
        streamChat: jest.fn(async function* () {
          throw new Error("fail");
        }),
      });

      await collectMessages((post) => controller.handleUserMessage("hi", post));
      expect(controller.busy).toBe(false);
    });
  });

  describe(MSG.CLEAR_CHAT, () => {
    it("sends clearChat message to webview", () => {
      const { controller } = createController();
      const messages: ExtensionMessage[] = [];
      controller.clearChat((m) => messages.push(m));

      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe(MSG.CLEAR_CHAT);
    });

    it("clears the underlying service history", async () => {
      const { controller, chatService } = createController();
      await collectMessages((post) => controller.handleUserMessage("hi", post));
      expect(chatService.getHistory().length).toBeGreaterThan(0);

      controller.clearChat(() => {});
      expect(chatService.getHistory()).toHaveLength(0);
    });
  });

  describe("checkProvider", () => {
    it("returns provider availability", async () => {
      const { controller } = createController();
      const result = await controller.checkProvider();
      expect(result.available).toBe(true);
    });

    it("returns error when provider is down", async () => {
      const { controller } = createController({
        isAvailable: jest.fn(async () => ({
          available: false,
          provider: "test",
          error: "offline",
        })),
      });
      const result = await controller.checkProvider();
      expect(result.available).toBe(false);
      expect(result.error).toBe("offline");
    });
  });

  describe("isSessionBusy", () => {
    it("returns false when no requests are active", () => {
      const { controller } = createController();
      expect(controller.isSessionBusy("any")).toBe(false);
    });
  });

  describe("dispose", () => {
    it("disposes the underlying service", () => {
      const { controller, provider } = createController();
      controller.dispose();
      expect(provider.dispose).toHaveBeenCalled();
    });
  });
});
