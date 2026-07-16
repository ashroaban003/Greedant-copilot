/**
 * Webview ↔ Extension host messaging protocol.
 *
 * Defines the shape of messages passed between the webview (browser)
 * and the extension host (Node.js) via postMessage.
 */

import { ChatMessage } from "./ChatMessage";

/** Message type constants — single source of truth, no magic strings */
export const MSG = {
  // Webview → Extension host
  SEND_MESSAGE: "sendMessage",
  CLEAR_CHAT: "clearChat",
  CANCEL_REQUEST: "cancelRequest",
  READY: "ready",
  REQUEST_MODELS: "requestModels",
  SELECT_MODEL: "selectModel",

  // Extension host → Webview
  RECEIVE_MESSAGE: "receiveMessage",
  STREAM_CHUNK: "streamChunk",
  STREAM_END: "streamEnd",
  ERROR: "error",
  SET_LOADING: "setLoading",
  MODEL_LIST: "modelList",
} as const;

/** Messages from webview -> extension host */
export type WebviewMessage =
  | { type: typeof MSG.SEND_MESSAGE; content: string }
  | { type: typeof MSG.CLEAR_CHAT }
  | { type: typeof MSG.CANCEL_REQUEST }
  | { type: typeof MSG.READY }
  | { type: typeof MSG.REQUEST_MODELS }
  | { type: typeof MSG.SELECT_MODEL; model: string };

/** Messages from extension host -> webview */
export type ExtensionMessage =
  | { type: typeof MSG.RECEIVE_MESSAGE; message: ChatMessage }
  | { type: typeof MSG.STREAM_CHUNK; messageId: string; content: string }
  | { type: typeof MSG.STREAM_END; messageId: string }
  | { type: typeof MSG.ERROR; error: string }
  | { type: typeof MSG.SET_LOADING; loading: boolean }
  | { type: typeof MSG.CLEAR_CHAT }
  | { type: typeof MSG.MODEL_LIST; models: string[]; activeModel: string };
