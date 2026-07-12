/**
 * Integration tests — full pipeline with real MockProvider.
 *
 * These tests exercise:
 *   ChatController → ChatService → MockProvider
 *
 * They verify the exact message sequence the webview receives,
 * catching issues that unit tests with mocked providers miss.
 */

import { ChatController } from "../../src/chat/ChatController";
import { ChatService } from "../../src/chat/ChatService";
import { MockProvider } from "../../src/llm/providers/MockProvider";
import { ExtensionMessage, MSG } from "../../src/chat/MessageProtocol";
import { ChatConfig } from "../../src/config/ChatConfig";

function createMockConfig(): ChatConfig {
  return {
    provider: "mock",
    ollamaBaseUrl: "http://localhost:11434",
    ollamaModel: "mock",
    systemPrompt: "You are a test assistant.",
  } as unknown as ChatConfig;
}

function buildPipeline() {
  const provider = new MockProvider();
  const config = createMockConfig();
  const chatService = new ChatService(provider, config);
  const controller = new ChatController(chatService);
  return { controller, chatService, provider };
}

async function collectMessages(
  controller: ChatController,
  content: string,
  sessionId?: string
): Promise<ExtensionMessage[]> {
  const messages: ExtensionMessage[] = [];
  await controller.handleUserMessage(
    content,
    (msg) => messages.push(msg),
    sessionId
  );
  return messages;
}

describe("Integration: ChatController → ChatService → MockProvider", () => {
  it("produces the correct message sequence for a simple message", async () => {
    const { controller } = buildPipeline();
    const messages = await collectMessages(controller, "hello");

    const types = messages.map((m) => m.type);

    // Expected sequence: setLoading(true), userMsg, assistantMsg, streamChunks..., streamEnd, setLoading(false)
    expect(types[0]).toBe(MSG.SET_LOADING);
    expect(types[1]).toBe(MSG.RECEIVE_MESSAGE);
    expect(types[2]).toBe(MSG.RECEIVE_MESSAGE);

    // Middle should be stream chunks
    const chunkTypes = types.slice(3, -2);
    for (const t of chunkTypes) {
      expect(t).toBe(MSG.STREAM_CHUNK);
    }

    // End
    expect(types[types.length - 2]).toBe(MSG.STREAM_END);
    expect(types[types.length - 1]).toBe(MSG.SET_LOADING);
  });

  it("first receiveMessage is user role with trimmed content", async () => {
    const { controller } = buildPipeline();
    const messages = await collectMessages(controller, "  hello  ");

    const userMsg = messages.find(
      (m) => m.type === MSG.RECEIVE_MESSAGE && "message" in m && m.message.role === "user"
    );
    expect(userMsg).toBeDefined();
    if (userMsg && "message" in userMsg) {
      expect(userMsg.message.content).toBe("hello");
    }
  });

  it("second receiveMessage is assistant placeholder with isStreaming=true", async () => {
    const { controller } = buildPipeline();
    const messages = await collectMessages(controller, "hello");

    const receiveMsgs = messages.filter(
      (m) => m.type === MSG.RECEIVE_MESSAGE
    ) as Array<{ type: typeof MSG.RECEIVE_MESSAGE; message: any }>;

    expect(receiveMsgs).toHaveLength(2);
    expect(receiveMsgs[1].message.role).toBe("assistant");
    expect(receiveMsgs[1].message.content).toBe("");
    expect(receiveMsgs[1].message.isStreaming).toBe(true);
  });

  it("stream chunks concatenate to a non-empty response", async () => {
    const { controller } = buildPipeline();
    const messages = await collectMessages(controller, "hello");

    const chunks = messages.filter(
      (m) => m.type === MSG.STREAM_CHUNK
    ) as Array<{ type: typeof MSG.STREAM_CHUNK; content: string }>;

    expect(chunks.length).toBeGreaterThan(0);

    const fullText = chunks.map((c) => c.content).join("");
    expect(fullText.length).toBeGreaterThan(0);
    expect(fullText.toLowerCase()).toContain("greedant");
  });

  it("streamEnd references the same messageId as the assistant placeholder", async () => {
    const { controller } = buildPipeline();
    const messages = await collectMessages(controller, "hello");

    const receiveMsgs = messages.filter(
      (m) => m.type === MSG.RECEIVE_MESSAGE
    ) as Array<{ type: typeof MSG.RECEIVE_MESSAGE; message: any }>;
    const assistantId = receiveMsgs[1].message.id;

    const streamEnd = messages.find(
      (m) => m.type === MSG.STREAM_END
    ) as { type: typeof MSG.STREAM_END; messageId: string } | undefined;

    expect(streamEnd).toBeDefined();
    expect(streamEnd!.messageId).toBe(assistantId);
  });

  it("stream chunks reference the same messageId as the assistant placeholder", async () => {
    const { controller } = buildPipeline();
    const messages = await collectMessages(controller, "hello");

    const receiveMsgs = messages.filter(
      (m) => m.type === MSG.RECEIVE_MESSAGE
    ) as Array<{ type: typeof MSG.RECEIVE_MESSAGE; message: any }>;
    const assistantId = receiveMsgs[1].message.id;

    const chunks = messages.filter(
      (m) => m.type === MSG.STREAM_CHUNK
    ) as Array<{ type: typeof MSG.STREAM_CHUNK; messageId: string }>;

    for (const chunk of chunks) {
      expect(chunk.messageId).toBe(assistantId);
    }
  });

  it("setLoading bookends are true at start, false at end", async () => {
    const { controller } = buildPipeline();
    const messages = await collectMessages(controller, "hello");

    const loadings = messages.filter(
      (m) => m.type === MSG.SET_LOADING
    ) as Array<{ type: typeof MSG.SET_LOADING; loading: boolean }>;

    expect(loadings[0].loading).toBe(true);
    expect(loadings[loadings.length - 1].loading).toBe(false);
  });

  it("conversation history grows after a complete exchange", async () => {
    const { controller, chatService } = buildPipeline();
    await collectMessages(controller, "hello");

    const history = chatService.getHistory();
    expect(history).toHaveLength(2);
    expect(history[0].role).toBe("user");
    expect(history[0].content).toBe("hello");
    expect(history[1].role).toBe("assistant");
    expect(history[1].content.length).toBeGreaterThan(0);
  });

  it("multiple messages build up history correctly", async () => {
    const { controller, chatService } = buildPipeline();
    await collectMessages(controller, "hello");
    await collectMessages(controller, "explain async");

    const history = chatService.getHistory();
    expect(history).toHaveLength(4);
    expect(history[0].content).toBe("hello");
    expect(history[2].content).toBe("explain async");
  });

  it("clearChat resets history and sends clearChat message", async () => {
    const { controller, chatService } = buildPipeline();
    await collectMessages(controller, "hello");
    expect(chatService.getHistory().length).toBeGreaterThan(0);

    const clearMessages: ExtensionMessage[] = [];
    controller.clearChat((msg) => clearMessages.push(msg));

    expect(chatService.getHistory()).toHaveLength(0);
    expect(clearMessages).toHaveLength(1);
    expect(clearMessages[0].type).toBe(MSG.CLEAR_CHAT);
  });

  it("concurrent requests on same session are rejected", async () => {
    const { controller } = buildPipeline();

    const msgs1: ExtensionMessage[] = [];
    const msgs2: ExtensionMessage[] = [];

    const p1 = controller.handleUserMessage("hello", (m) => msgs1.push(m));
    // Give p1 a tick to register
    await new Promise((r) => setTimeout(r, 5));
    const p2 = controller.handleUserMessage("world", (m) => msgs2.push(m));

    await Promise.all([p1, p2]);

    const error = msgs2.find((m) => m.type === MSG.ERROR) as
      | { type: typeof MSG.ERROR; error: string }
      | undefined;
    expect(error).toBeDefined();
    expect(error!.error).toContain("already in progress");
  });

  it("concurrent requests on different sessions both succeed", async () => {
    const { controller } = buildPipeline();

    const msgs1: ExtensionMessage[] = [];
    const msgs2: ExtensionMessage[] = [];

    const p1 = controller.handleUserMessage("hello", (m) => msgs1.push(m), "s1");
    const p2 = controller.handleUserMessage("hi", (m) => msgs2.push(m), "s2");

    await Promise.all([p1, p2]);

    expect(msgs1.some((m) => m.type === MSG.STREAM_END)).toBe(true);
    expect(msgs2.some((m) => m.type === MSG.STREAM_END)).toBe(true);
  });

  it("empty input produces no messages", async () => {
    const { controller } = buildPipeline();
    const messages = await collectMessages(controller, "   ");
    expect(messages).toHaveLength(0);
  });

  it("provider responses vary by input keyword", async () => {
    const { controller } = buildPipeline();

    const helloMsgs = await collectMessages(controller, "hello");
    const solidMsgs = await collectMessages(controller, "What are the SOLID principles?");

    const helloChunks = helloMsgs
      .filter((m) => m.type === MSG.STREAM_CHUNK)
      .map((m) => (m as any).content)
      .join("");

    const solidChunks = solidMsgs
      .filter((m) => m.type === MSG.STREAM_CHUNK)
      .map((m) => (m as any).content)
      .join("");

    expect(helloChunks).not.toBe(solidChunks);
    expect(solidChunks).toContain("Single Responsibility");
  });
});
