import { LLMProvider } from "../LLMProvider";
import {
  LLMRequest,
  LLMResponse,
  LLMStreamChunk,
  ProviderStatus,
  FinishReason,
  ModelInfo,
} from "../LLMTypes";
import { ChatConfig } from "../../config/ChatConfig";
import { httpRequest, httpRequestStream } from "../HttpClient";

/**
 * Ollama LLM provider implementation.
 *
 * Uses the shared HttpClient for all network communication
 * with the local Ollama server.
 */
export class OllamaProvider implements LLMProvider {
  readonly name = "ollama";
  private config: ChatConfig;

  constructor(config: ChatConfig) {
    this.config = config;
  }

  private get baseUrl(): string {
    return this.config.ollamaBaseUrl;
  }

  private get model(): string {
    return this.config.ollamaModel;
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const model = request.model || this.model;
    const body = this.buildRequestBody(model, request, false);

    try {
      const raw = await httpRequest({
        baseUrl: this.baseUrl,
        path: "/api/chat",
        method: "POST",
        body,
      });
      const data = JSON.parse(raw) as OllamaChatResponse;

      return {
        content: data.message?.content || "",
        model: data.model || model,
        finishReason: data.done ? FinishReason.Stop : undefined,
      };
    } catch (error: any) {
      throw this.wrapError(error);
    }
  }

  async *streamChat(
    request: LLMRequest
  ): AsyncGenerator<LLMStreamChunk, void, unknown> {
    const model = request.model || this.model;
    const body = this.buildRequestBody(model, request, true);

    try {
      const stream = await httpRequestStream({
        baseUrl: this.baseUrl,
        path: "/api/chat",
        method: "POST",
        body,
      });

      let buffer = "";
      for await (const chunk of stream) {
        buffer += chunk;
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }
          try {
            const parsed = JSON.parse(line) as OllamaStreamChunk;
            const content = parsed.message?.content || "";
            if (content || parsed.done) {
              yield { content, done: parsed.done || false };
            }
            if (parsed.done) {
              return;
            }
          } catch {
            // skip malformed JSON lines
          }
        }
      }

      // Process remaining buffer
      if (buffer.trim()) {
        try {
          const parsed = JSON.parse(buffer) as OllamaStreamChunk;
          yield { content: parsed.message?.content || "", done: true };
        } catch {
          // skip
        }
      }
    } catch (error: any) {
      throw this.wrapError(error);
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const raw = await httpRequest({
        baseUrl: this.baseUrl,
        path: "/api/tags",
        method: "GET",
      });
      const data = JSON.parse(raw) as { models?: Array<{ name: string }> };
      const models = data.models;
      if (!Array.isArray(models)) {
        return [];
      }
      return models
        .map((m) => m.name)
        .filter((name) => typeof name === "string" && name.length > 0);
    } catch {
      return [];
    }
  }

  async isAvailable(): Promise<ProviderStatus> {
    try {
      const raw = await httpRequest({
        baseUrl: this.baseUrl,
        path: "/api/tags",
        method: "GET",
      });
      const data = JSON.parse(raw) as { models?: Array<{ name: string }> };
      const models = data.models || [];
      const modelAvailable = models.some(
        (m) => m.name === this.model || m.name.startsWith(`${this.model}:`)
      );

      if (!modelAvailable) {
        return {
          available: false,
          provider: this.name,
          model: this.model,
          error: `Model "${this.model}" not found. Run: ollama pull ${this.model}`,
        };
      }

      return { available: true, provider: this.name, model: this.model };
    } catch {
      return {
        available: false,
        provider: this.name,
        error: `Cannot reach Ollama at ${this.baseUrl}. Run: ollama serve`,
      };
    }
  }

  async getModelInfo(model?: string): Promise<ModelInfo | null> {
    const targetModel = model || this.model;
    try {
      const raw = await httpRequest({
        baseUrl: this.baseUrl,
        path: "/api/show",
        method: "POST",
        body: JSON.stringify({ model: targetModel }),
      });
      const data = JSON.parse(raw) as OllamaShowResponse;

      // Extract context length from model_info or parameters
      let contextLength = 4096; // Ollama default

      if (data.model_info) {
        // Look for context_length in model_info keys
        for (const key of Object.keys(data.model_info)) {
          if (key.includes("context_length")) {
            const val = data.model_info[key];
            if (typeof val === "number" && val > 0) {
              contextLength = val;
              break;
            }
          }
        }
      }

      // Fallback: parse num_ctx from parameters string
      if (contextLength === 4096 && data.parameters) {
        const match = data.parameters.match(/num_ctx\s+(\d+)/);
        if (match) {
          contextLength = parseInt(match[1], 10);
        }
      }

      return { name: targetModel, contextLength };
    } catch {
      return null;
    }
  }

  dispose(): void {}

  // ─── Private helpers ───────────────────────────────────────────

  private buildRequestBody(model: string, request: LLMRequest, stream: boolean): string {
    return JSON.stringify({
      model,
      messages: request.messages.map((msg) => ({ role: msg.role, content: msg.content })),
      stream,
      ...(request.temperature !== undefined && {
        options: { temperature: request.temperature },
      }),
    });
  }

  private wrapError(error: any): Error {
    const msg = error?.message || String(error);
    if (msg.includes("ECONNREFUSED") || msg.includes("timed out")) {
      return new Error(
        `Cannot reach Ollama at ${this.baseUrl}. Make sure it's running:\n\n  ollama serve`
      );
    }
    return error instanceof Error ? error : new Error(msg);
  }
}

// ─── Internal Ollama API types ─────────────────────────────────

interface OllamaChatResponse {
  model: string;
  message?: { role: string; content: string };
  done: boolean;
}

interface OllamaStreamChunk {
  model?: string;
  message?: { role: string; content: string };
  done: boolean;
}

interface OllamaShowResponse {
  model_info?: Record<string, unknown>;
  parameters?: string;
}
