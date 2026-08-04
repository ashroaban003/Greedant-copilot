import { LLMRequest, LLMResponse, LLMStreamChunk, ProviderStatus } from "./LLMTypes";

export interface LLMProvider {
  readonly name: string;

  chat(request: LLMRequest): Promise<LLMResponse>;

  streamChat(request: LLMRequest): AsyncGenerator<LLMStreamChunk, void, unknown>;

  isAvailable(): Promise<ProviderStatus>;

  listModels?(): Promise<string[]>;

  getContextWindowSize?(model?: string): Promise<number>;

  dispose(): void;
}
