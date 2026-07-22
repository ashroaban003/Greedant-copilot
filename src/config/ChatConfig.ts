import * as vscode from "vscode";
import {
  CONFIG_SECTION,
  CONFIG_PROVIDER,
  CONFIG_OLLAMA_BASE_URL,
  CONFIG_OLLAMA_MODEL,
  CONFIG_OLLAMA_CONTEXT_SIZE,
  CONFIG_SYSTEM_PROMPT,
  DEFAULT_PROVIDER,
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OLLAMA_MODEL,
  DEFAULT_OLLAMA_CONTEXT_SIZE,
  DEFAULT_SYSTEM_PROMPT,
} from "../constants";

/**
 * Centralized configuration reader for the chat extension.
 */
export class ChatConfig {
  private get config(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(CONFIG_SECTION);
  }
  
  get provider(): string {
    return this.config.get<string>(CONFIG_PROVIDER, DEFAULT_PROVIDER);
  }

  get ollamaBaseUrl(): string {
    return this.config.get<string>(CONFIG_OLLAMA_BASE_URL, DEFAULT_OLLAMA_BASE_URL);
  }

  get ollamaModel(): string {
    return this.config.get<string>(CONFIG_OLLAMA_MODEL, DEFAULT_OLLAMA_MODEL);
  }

  get ollamaContextSize(): number {
    return this.config.get<number>(CONFIG_OLLAMA_CONTEXT_SIZE, DEFAULT_OLLAMA_CONTEXT_SIZE);
  }

  get systemPrompt(): string {
    return this.config.get<string>(CONFIG_SYSTEM_PROMPT, DEFAULT_SYSTEM_PROMPT);
  }
}
