/**
 * Chat layer types.
 *
 * These types define the structure of messages exchanged between
 * the webview UI and the extension host, and the internal chat state.
 */

/** Message roles in the chat */
export type ChatRole = "user" | "assistant" | "system";

/** A single chat message displayed in the UI */
export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  isError?: boolean;
}

/** Request from webview to extension host */
export interface ChatRequest {
  type: "chat";
  message: string;
}

/** Response from extension host to webview */
export interface ChatResponse {
  type: "response" | "stream_chunk" | "stream_end" | "error";
  content?: string;
  messageId?: string;
  error?: string;
}

/** Messages from webview -> extension host */
export type WebviewMessage =
  | { type: "sendMessage"; content: string }
  | { type: "clearChat" }
  | { type: "cancelRequest" }
  | { type: "ready" };

/** Messages from extension host -> webview */
export type ExtensionMessage =
  | { type: "receiveMessage"; message: ChatMessage }
  | { type: "streamChunk"; messageId: string; content: string }
  | { type: "streamEnd"; messageId: string }
  | { type: "error"; error: string }
  | { type: "setLoading"; loading: boolean }
  | { type: "clearChat" };

