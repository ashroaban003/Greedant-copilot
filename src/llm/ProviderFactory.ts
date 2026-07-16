import { LLMProvider } from "./LLMProvider";
import { OllamaProvider } from "./providers/OllamaProvider";
import { MockProvider } from "./providers/MockProvider";
import { ChatConfig } from "../config/ChatConfig";

/**
 * Factory that creates the appropriate LLM provider based on configuration.
 * Centralizes provider instantiation so extension.ts doesn't need to know
 * about every provider implementation.
 */
export function createProvider(config: ChatConfig): LLMProvider {
  // return new MockProvider();
  switch (config.provider) {
    case "ollama":
      return new OllamaProvider(config);
    case "mock":
      return new MockProvider();
    default:
      return new OllamaProvider(config);
  }
}
