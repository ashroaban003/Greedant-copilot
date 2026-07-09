/**
 * Greedant extension constants.
 * Central place for IDs, defaults, and magic strings.
 */

export const EXTENSION_ID = "greedant";
export const EXTENSION_NAME = "Greedant";

// View identifiers
export const VIEW_ID = "greedant.chatView";
export const VIEW_CONTAINER_ID = "greedant-sidebar";

// Command identifiers
export const CMD_OPEN_CHAT = "greedant.openChat";
export const CMD_CLEAR_CHAT = "greedant.clearChat";

// Configuration keys
export const CONFIG_SECTION = "greedant";
export const CONFIG_PROVIDER = "provider";
export const CONFIG_OLLAMA_BASE_URL = "ollama.baseUrl";
export const CONFIG_OLLAMA_MODEL = "ollama.model";
export const CONFIG_SYSTEM_PROMPT = "systemPrompt";

// Default values
export const DEFAULT_PROVIDER = "ollama";
export const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
export const DEFAULT_OLLAMA_MODEL = "qwen2.5-coder:3b";
export const DEFAULT_SYSTEM_PROMPT =
  "You are Greedant, a helpful AI coding assistant. You help developers write, understand, and debug code. Be concise, accurate, and helpful.";
