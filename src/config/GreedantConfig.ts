import * as vscode from "vscode";
import {
  CONFIG_SECTION,
  CONFIG_PROVIDER,
  CONFIG_OLLAMA_BASE_URL,
  CONFIG_OLLAMA_MODEL,
  CONFIG_SYSTEM_PROMPT,
  DEFAULT_PROVIDER,
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OLLAMA_MODEL,
  DEFAULT_SYSTEM_PROMPT,
} from "../constants";

/**
 * Centralized configuration reader for the Greedant extension.
 *
 * All VS Code settings are read through this class to keep
 * configuration access consistent and easy to extend.
 *
 * Future extensions:
 * - Add provider-specific configs (OpenAI key, Anthropic key, etc.)
 * - Add context window size settings
 * - Add RAG/indexing configuration
 * - Add telemetry opt-in/out settings
 * - Add workspace-level overrides
 */
export class GreedantConfig {
  private get config(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(CONFIG_SECTION);
  }

  /** Active LLM provider name */
  get provider(): string {
    return this.config.get<string>(CONFIG_PROVIDER, DEFAULT_PROVIDER);
  }

  /** Ollama server base URL */
  get ollamaBaseUrl(): string {
    return this.config.get<string>(CONFIG_OLLAMA_BASE_URL, DEFAULT_OLLAMA_BASE_URL);
  }

  /** Ollama model identifier */
  get ollamaModel(): string {
    return this.config.get<string>(CONFIG_OLLAMA_MODEL, DEFAULT_OLLAMA_MODEL);
  }

  /** System prompt sent at conversation start */
  get systemPrompt(): string {
    return this.config.get<string>(CONFIG_SYSTEM_PROMPT, DEFAULT_SYSTEM_PROMPT);
  }
}
