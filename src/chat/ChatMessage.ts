/**
 * Chat message domain types.
 */

/** Message roles in the chat */
export enum ChatRole {
  User = "user",
  Assistant = "assistant",
}

/** A single chat message displayed in the UI */
export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  isError?: boolean;
}
