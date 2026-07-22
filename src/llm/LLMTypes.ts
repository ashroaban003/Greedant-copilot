/**
 * Core types for LLM provider abstraction.
 *
 * These types define the contract between the chat layer and
 * any LLM backend. New providers only need to implement the
 * LLMProvider interface using these shared types.
 */

/** Role of a message in the conversation */
export type MessageRole = "system" | "user" | "assistant";

/** A single message in the conversation history */
export interface LLMMessage {
  role: MessageRole;
  content: string;
}

/** Request payload sent to an LLM provider */
export interface LLMRequest {
  messages: LLMMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

/** Finish reason for LLM responses */
export enum FinishReason {
  Stop = "stop",
  Length = "length",
  ToolCalls = "tool_calls",
  Error = "error",
}

/** Response from an LLM provider (non-streaming) */
export interface LLMResponse {
  content: string;
  model: string;
  finishReason?: FinishReason;
}

/** A chunk in a streaming response */
export interface LLMStreamChunk {
  content: string;
  done: boolean;
}

/** Provider availability status */
export interface ProviderStatus {
  available: boolean;
  provider: string;
  model?: string;
  error?: string;
}

/** Model metadata retrieved from provider */
export interface ModelInfo {
  /** Model name/identifier */
  name: string;
  /** Context window size in tokens */
  contextLength: number;
}

