import { LLMRequest, LLMResponse, LLMStreamChunk, ProviderStatus } from "./LLMTypes";

/**
 * Abstract interface for LLM providers.
 *
 * Any backend (Ollama, OpenAI, Anthropic, LM Studio, OpenRouter, etc.)
 * must implement this interface. The chat layer calls providers through
 * this contract, keeping the architecture provider-agnostic.
 *
 * Future providers to implement:
 * - OpenAIProvider
 * - AnthropicProvider
 * - OpenRouterProvider
 * - LMStudioProvider
 * - CustomProvider (for self-hosted endpoints)
 */
export interface LLMProvider {
  /** Human-readable provider name */
  readonly name: string;

  /**
   * Send a chat completion request and receive the full response.
   * Use this for simple request/response flows.
   */
  chat(request: LLMRequest): Promise<LLMResponse>;

  /**
   * Send a chat completion request and receive a stream of chunks.
   * Use this for real-time streaming in the UI.
   *
   * Returns an async generator that yields content chunks.
   */
  streamChat(request: LLMRequest): AsyncGenerator<LLMStreamChunk, void, unknown>;

  /**
   * Check whether the provider is reachable and ready.
   * Useful for showing connection status in the UI.
   */
  isAvailable(): Promise<ProviderStatus>;

  /**
   * List available models from this provider.
   * Returns an array of model name strings.
   * Returns empty array if the provider doesn't support listing or is unreachable.
   */
  listModels?(): Promise<string[]>;

  /**
   * Dispose of any resources held by this provider.
   * Called when the extension deactivates or provider switches.
   */
  dispose(): void;
}
