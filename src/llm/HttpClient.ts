import * as http from "http";
import * as https from "https";

export interface HttpRequestOptions {
  baseUrl: string;
  path: string;
  method?: "GET" | "POST";
  body?: string;
  timeout?: number;
}

const DEFAULT_TIMEOUT_GET = 5000;
const DEFAULT_TIMEOUT_POST = 120000;

/**
 * Lightweight HTTP client using Node.js native modules.
 * Designed for use within the VS Code extension host where
 * third-party HTTP libraries may not be available.
 */

function resolveLib(url: URL) {
  return url.protocol === "https:" ? https : http;
}

function buildRequestOptions(url: URL, method: string, body?: string, timeout?: number): http.RequestOptions {
  return {
    method,
    hostname: url.hostname,
    port: url.port,
    path: url.pathname,
    timeout,
    ...(body !== undefined && {
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    }),
  };
}

/**
 * Perform an HTTP request and return the full response body as a string.
 */
export function httpRequest(options: HttpRequestOptions): Promise<string> {
  const { baseUrl, path, method = "GET", body, timeout } = options;
  const effectiveTimeout = timeout ?? (method === "GET" ? DEFAULT_TIMEOUT_GET : DEFAULT_TIMEOUT_POST);

  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const lib = resolveLib(url);
    const reqOptions = buildRequestOptions(url, method, body, effectiveTimeout);

    const req = lib.request(reqOptions, (res) => {
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

    if (body !== undefined) {
      req.write(body);
    }
    req.end();
  });
}

/**
 * Perform an HTTP POST request and return an async iterable that streams
 * response chunks as they arrive.
 */
export function httpRequestStream(options: HttpRequestOptions): Promise<AsyncIterable<string>> {
  const { baseUrl, path, body, timeout = DEFAULT_TIMEOUT_POST } = options;

  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const lib = resolveLib(url);
    const reqOptions = buildRequestOptions(url, "POST", body, timeout);

    const req = lib.request(reqOptions, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => reject(new Error(`HTTP ${res.statusCode}: ${data}`)));
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

    if (body !== undefined) {
      req.write(body);
    }
    req.end();
  });
}
