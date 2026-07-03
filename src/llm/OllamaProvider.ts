import * as http from "http";
import * as https from "https";
import { LLMProvider } from "./LLMProvider";
import {
  LLMRequest,
  LLMResponse,
  LLMStreamChunk,
  LLMMessage,
  ProviderStatus,
} from "./LLMTypes";
import { GreedantConfig } from "../config/GreedantConfig";

/**
 * Ollama LLM provider implementation.
 *
 * Uses Node.js native http/https modules for reliable connectivity
 * within the VS Code extension host environment.
 */
export class OllamaProvider implements LLMProvider {
  readonly name = "ollama";
  private config: GreedantConfig;

  constructor(config: GreedantConfig) {
    this.config = config;
  }

  private get baseUrl(): string {
    return this.config.ollamaBaseUrl;
  }

  private get model(): string {
    return this.config.ollamaModel;
  }

  /**
   * Send a non-streaming chat request to Ollama.
   */
  async chat(request: LLMRequest): Promise<LLMResponse> {
    const model = request.model || this.model;

    const body = JSON.stringify({
      model,
      messages: this.formatMessages(request.messages),
      stream: false,
      ...(request.temperature !== undefined && {
        options: { temperature: request.temperature },
      }),
    });

    try {
      const raw = await this.httpPost("/api/chat", body);
      const data = JSON.parse(raw) as OllamaChatResponse;

      return {
        content: data.message?.content || "",
        model: data.model || model,
        finishReason: data.done ? "stop" : undefined,
      };
    } catch (error: any) {
      throw this.wrapError(error);
    }
  }

  /**
   * Stream a chat response from Ollama, yielding chunks as they arrive.
   */
  async *streamChat(
    request: LLMRequest
  ): AsyncGenerator<LLMStreamChunk, void, unknown> {
    const model = request.model || this.model;

    const body = JSON.stringify({
      model,
      messages: this.formatMessages(request.messages),
      stream: true,
      ...(request.temperature !== undefined && {
        options: { temperature: request.temperature },
      }),
    });

    try {
      const stream = await this.httpPostStream("/api/chat", body);

      let buffer = "";
      for await (const chunk of stream) {
        buffer += chunk;
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line) as OllamaStreamChunk;
            const content = parsed.message?.content || "";
            if (content || parsed.done) {
              yield { content, done: parsed.done || false };
            }
            if (parsed.done) return;
          } catch {
            // skip malformed JSON
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

  /**
   * Check if the Ollama server is reachable and the model is available.
   */
  async isAvailable(): Promise<ProviderStatus> {
    try {
      const raw = await this.httpGet("/api/tags");
      const data = JSON.parse(raw) as { models?: Array<{ name: string }> };
      const models = data.models || [];
      const modelNames = models.map((m) => m.name);

      const modelAvailable = modelNames.some(
        (name) => name === this.model || name.startsWith(`${this.model}:`)
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

  dispose(): void {}

  // ─── HTTP helpers using Node native modules ─────────

  private httpGet(path: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const lib = url.protocol === "https:" ? https : http;

      const req = lib.get(url.toString(), { timeout: 5000 }, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          } else {
            resolve(data);
          }
        });
      });

      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Request timed out"));
      });
    });
  }

  private httpPost(path: string, body: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const lib = url.protocol === "https:" ? https : http;

      const options: http.RequestOptions = {
        method: "POST",
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: 120000,
      };

      const req = lib.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          } else {
            resolve(data);
          }
        });
      });

      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Request timed out"));
      });

      req.write(body);
      req.end();
    });
  }

  private httpPostStream(
    path: string,
    body: string
  ): Promise<AsyncIterable<string>> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const lib = url.protocol === "https:" ? https : http;

      const options: http.RequestOptions = {
        method: "POST",
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: 120000,
      };

      const req = lib.request(options, (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () =>
            reject(new Error(`HTTP ${res.statusCode}: ${data}`))
          );
          return;
        }

        res.setEncoding("utf8");

        const iterable: AsyncIterable<string> = {
          [Symbol.asyncIterator]() {
            return {
              next(): Promise<IteratorResult<string>> {
                return new Promise((resolveNext, rejectNext) => {
                  const onData = (chunk: string) => {
                    cleanup();
                    resolveNext({ value: chunk, done: false });
                  };
                  const onEnd = () => {
                    cleanup();
                    resolveNext({ value: "", done: true });
                  };
                  const onError = (err: Error) => {
                    cleanup();
                    rejectNext(err);
                  };
                  const cleanup = () => {
                    res.removeListener("data", onData);
                    res.removeListener("end", onEnd);
                    res.removeListener("error", onError);
                  };

                  res.once("data", onData);
                  res.once("end", onEnd);
                  res.once("error", onError);
                });
              },
            };
          },
        };

        resolve(iterable);
      });

      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Request timed out"));
      });

      req.write(body);
      req.end();
    });
  }

  private formatMessages(
    messages: LLMMessage[]
  ): Array<{ role: string; content: string }> {
    return messages.map((msg) => ({ role: msg.role, content: msg.content }));
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

// Internal Ollama API types
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
