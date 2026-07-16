import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import { EXTENSION_NAME } from "../constants";
import { ChatConfig } from "../config/ChatConfig";

export interface HtmlBuildContext {
  webview: vscode.Webview;
  extensionUri: vscode.Uri;
  config: ChatConfig;
}

/**
 * Builds the complete webview HTML by assembling component partials,
 * injecting security tokens, and resolving asset URIs.
 *
 * This is a pure builder — it has no knowledge of webview lifecycle
 * or message routing.
 */
export async function buildChatHtml(ctx: HtmlBuildContext): Promise<string> {
  const frontendRoot = path.join(ctx.extensionUri.fsPath, "src", "frontend");
  const pageDir = path.join(frontendRoot, "pages", "chat");

  const [shell, headerHtml, messageHtml, inputHtml, modelSelectorHtml] = await Promise.all([
    fs.readFile(path.join(pageDir, "chat.html"), "utf8"),
    fs.readFile(path.join(frontendRoot, "components", "header", "header.html"), "utf8"),
    fs.readFile(path.join(frontendRoot, "components", "message", "message.html"), "utf8"),
    fs.readFile(path.join(frontendRoot, "components", "input", "input.html"), "utf8"),
    fs.readFile(path.join(frontendRoot, "components", "model-selector", "model-selector.html"), "utf8"),
  ]);

  const uri = (relativePath: string) =>
    ctx.webview.asWebviewUri(
      vscode.Uri.file(path.join(frontendRoot, relativePath))
    ).toString();

  const nonce = generateNonce();
  const modelLabel = `${ctx.config.provider} · ${ctx.config.ollamaModel}`;

  return shell
    // Component partials
    .replace(/\{\{headerHtml\}\}/g, headerHtml)
    .replace(/\{\{messageHtml\}\}/g, messageHtml)
    .replace(/\{\{inputHtml\}\}/g, inputHtml)
    .replace(/\{\{modelSelectorHtml\}\}/g, modelSelectorHtml)
    // Security
    .replace(/\{\{nonce\}\}/g, nonce)
    .replace(/\{\{cspSource\}\}/g, ctx.webview.cspSource)
    // CSS
    .replace(/\{\{baseCssUri\}\}/g, uri("shared/base.css"))
    .replace(/\{\{headerCssUri\}\}/g, uri("components/header/header.css"))
    .replace(/\{\{messageCssUri\}\}/g, uri("components/message/message.css"))
    .replace(/\{\{inputCssUri\}\}/g, uri("components/input/input.css"))
    .replace(/\{\{modelSelectorCssUri\}\}/g, uri("components/model-selector/model-selector.css"))
    // JS
    .replace(/\{\{iconsJsUri\}\}/g, uri("shared/icons.js"))
    .replace(/\{\{messageJsUri\}\}/g, uri("components/message/message.js"))
    .replace(/\{\{headerJsUri\}\}/g, uri("components/header/header.js"))
    .replace(/\{\{inputJsUri\}\}/g, uri("components/input/input.js"))
    .replace(/\{\{modelSelectorJsUri\}\}/g, uri("components/model-selector/model-selector.js"))
    .replace(/\{\{chatJsUri\}\}/g, uri("pages/chat/chat.js"))
    // Config
    .replace(/\{\{extensionName\}\}/g, EXTENSION_NAME)
    .replace(/\{\{modelLabel\}\}/g, modelLabel);
}

function generateNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
