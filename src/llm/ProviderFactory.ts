import { LLMProvider } from "./LLMProvider";
import { OllamaProvider } from "./providers/OllamaProvider";
import { MockProvider } from "./providers/MockProvider";
import { ChatConfig } from "../config/ChatConfig";

/**
 * centralized factory function to create LLMProvider instances based on the provided configuration.
 */
export function createProvider(config: ChatConfig): LLMProvider {
  // mreturn new MockProvider();
  switch (config.provider) {
    case "ollama":
      return new OllamaProvider(config);
    case "mock":
      return new MockProvider();
    default:
      return new OllamaProvider(config);
  }
}
