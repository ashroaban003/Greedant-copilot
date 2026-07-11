import * as http from "http";
import * as https from "https";
import * as net from "net";

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
 *
 * Streaming requests use a raw TCP socket to bypass Node's strict
 * HTTP parser (llhttp) which throws HPE_JS_EXCEPTION on Ollama's
 * chunked ndjson responses.
 */

function resolveLib(url: URL) {
  return url.protocol === "https:" ? https : http;
}

function buildRequestOptions(url: URL, method: string, body?: string, timeout?: number): http.RequestOptions {
  return {
    method,
    hostname: url.hostname,
    port: url.port || (url.protocol === "https:" ? 443 : 80),
    path: url.pathname + url.search,
    timeout,
    insecureHTTPParser: true,
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
 *
 * This implementation uses a raw TCP socket to bypass Node.js's strict
 * HTTP parser (llhttp) which can throw HPE_JS_EXCEPTION when parsing
 * Ollama's chunked ndjson streaming responses. By handling HTTP at
 * the socket level, we avoid parser incompatibilities in the VS Code
 * extension host's Electron-bundled Node.js.
 */
export function httpRequestStream(options: HttpRequestOptions): Promise<AsyncIterable<string>> {
  const { baseUrl, path, body, timeout = DEFAULT_TIMEOUT_POST } = options;

  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const hostname = url.hostname;
    const port = parseInt(url.port || "80", 10);
    const requestPath = url.pathname + url.search;

    // For HTTPS, fall back to the standard http module approach
    if (url.protocol === "https:") {
      return resolveWithHttpModule(options, resolve, reject);
    }

    const socket = net.createConnection({ host: hostname, port }, () => {
      // Build raw HTTP request
      const headers: string[] = [
        `POST ${requestPath} HTTP/1.1`,
        `Host: ${hostname}:${port}`,
        `Content-Type: application/json`,
        `Accept: application/x-ndjson`,
        `Connection: close`,
      ];

      if (body !== undefined) {
        headers.push(`Content-Length: ${Buffer.byteLength(body)}`);
      }

      const rawRequest = headers.join("\r\n") + "\r\n\r\n" + (body || "");
      socket.write(rawRequest);
    });

    socket.setTimeout(timeout);

    let headersParsed = false;
    let headerBuffer = "";
    let statusCode = 0;
    let isChunked = false;
    let bodyBuffer = "";
    let chunkBuffer = Buffer.alloc(0);

    // We'll accumulate body data and expose it via async iterable
    const dataQueue: string[] = [];
    let dataResolve: ((value: IteratorResult<string>) => void) | null = null;
    let streamDone = false;
    let streamError: Error | null = null;

    function pushData(data: string) {
      if (dataResolve) {
        const resolver = dataResolve;
        dataResolve = null;
        resolver({ value: data, done: false });
      } else {
        dataQueue.push(data);
      }
    }

    function endStream() {
      streamDone = true;
      if (dataResolve) {
        const resolver = dataResolve;
        dataResolve = null;
        resolver({ value: "", done: true });
      }
    }

    function errorStream(err: Error) {
      streamError = err;
      if (dataResolve) {
        const resolver = dataResolve;
        dataResolve = null;
        // For aborted connections after we've already started streaming,
        // just end the stream gracefully
        resolver({ value: "", done: true });
      }
    }

    /**
     * Decode chunked transfer encoding from raw bytes.
     * Each chunk: <hex-size>\r\n<data>\r\n
     * Final chunk: 0\r\n\r\n
     */
    function processChunkedData(rawData: Buffer) {
      chunkBuffer = Buffer.concat([chunkBuffer, rawData]);

      while (true) {
        // Find the chunk size line
        const crlfIndex = chunkBuffer.indexOf("\r\n");
        if (crlfIndex === -1) {
          break; // Need more data
        }

        const sizeLine = chunkBuffer.subarray(0, crlfIndex).toString("ascii").trim();
        // Remove chunk extensions if present
        const sizeStr = sizeLine.split(";")[0].trim();
        const chunkSize = parseInt(sizeStr, 16);

        if (isNaN(chunkSize)) {
          // Malformed chunk - try to recover by treating remaining as raw data
          const remaining = chunkBuffer.toString("utf8");
          if (remaining.trim()) {
            pushData(remaining);
          }
          chunkBuffer = Buffer.alloc(0);
          break;
        }

        if (chunkSize === 0) {
          // Final chunk
          endStream();
          socket.destroy();
          return;
        }

        // Check if we have the complete chunk data + trailing \r\n
        const dataStart = crlfIndex + 2;
        const dataEnd = dataStart + chunkSize;
        const chunkEnd = dataEnd + 2; // trailing \r\n

        if (chunkBuffer.length < chunkEnd) {
          break; // Need more data
        }

        const chunkData = chunkBuffer.subarray(dataStart, dataEnd).toString("utf8");
        pushData(chunkData);

        // Advance buffer past this chunk
        chunkBuffer = chunkBuffer.subarray(chunkEnd);
      }
    }

    function processRawData(data: string) {
      pushData(data);
    }

    socket.on("data", (rawData: Buffer) => {
      if (!headersParsed) {
        // Accumulate until we find the header/body separator
        headerBuffer += rawData.toString("utf8");
        const headerEnd = headerBuffer.indexOf("\r\n\r\n");
        if (headerEnd === -1) {
          return; // Need more header data
        }

        // Parse headers
        const headerSection = headerBuffer.substring(0, headerEnd);
        const bodyStart = headerBuffer.substring(headerEnd + 4);
        headersParsed = true;

        const headerLines = headerSection.split("\r\n");
        const statusLine = headerLines[0];
        const statusMatch = statusLine.match(/HTTP\/\d\.\d\s+(\d+)/);
        statusCode = statusMatch ? parseInt(statusMatch[1], 10) : 0;

        // Check transfer encoding
        for (const line of headerLines) {
          if (line.toLowerCase().startsWith("transfer-encoding:")) {
            if (line.toLowerCase().includes("chunked")) {
              isChunked = true;
            }
          }
        }

        if (statusCode >= 400) {
          // Collect error body and reject
          bodyBuffer = bodyStart;
          socket.on("data", (moreData: Buffer) => {
            bodyBuffer += moreData.toString("utf8");
          });
          socket.once("end", () => {
            reject(new Error(`HTTP ${statusCode}: ${bodyBuffer}`));
          });
          socket.once("close", () => {
            reject(new Error(`HTTP ${statusCode}: ${bodyBuffer}`));
          });
          return;
        }

        // Success - create the async iterable and resolve
        const iterable: AsyncIterable<string> = {
          [Symbol.asyncIterator]() {
            return {
              next(): Promise<IteratorResult<string>> {
                if (dataQueue.length > 0) {
                  return Promise.resolve({ value: dataQueue.shift()!, done: false });
                }
                if (streamDone) {
                  return Promise.resolve({ value: "", done: true });
                }
                if (streamError) {
                  return Promise.resolve({ value: "", done: true });
                }
                return new Promise((res) => {
                  dataResolve = res;
                });
              },
            };
          },
        };

        resolve(iterable);

        // Process any body data that came with the headers
        if (bodyStart.length > 0) {
          if (isChunked) {
            processChunkedData(Buffer.from(bodyStart, "utf8"));
          } else {
            processRawData(bodyStart);
          }
        }
        return;
      }

      // Body data after headers are parsed
      if (isChunked) {
        processChunkedData(rawData);
      } else {
        processRawData(rawData.toString("utf8"));
      }
    });

    socket.on("end", () => {
      if (!headersParsed) {
        reject(new Error("Connection closed before headers received"));
      } else {
        endStream();
      }
    });

    socket.on("close", () => {
      if (!headersParsed) {
        reject(new Error("Connection closed unexpectedly"));
      } else {
        endStream();
      }
    });

    socket.on("error", (err) => {
      if (!headersParsed) {
        reject(err);
      } else {
        errorStream(err);
      }
    });

    socket.on("timeout", () => {
      socket.destroy();
      if (!headersParsed) {
        reject(new Error("Request timed out"));
      } else {
        errorStream(new Error("Request timed out"));
      }
    });
  });
}

/**
 * Fallback for HTTPS streaming - uses Node's http module.
 * HTTPS requires TLS which we can't easily do with raw sockets.
 */
function resolveWithHttpModule(
  options: HttpRequestOptions,
  resolve: (value: AsyncIterable<string>) => void,
  reject: (reason: Error) => void
): void {
  const { baseUrl, path, body, timeout = DEFAULT_TIMEOUT_POST } = options;
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
}
