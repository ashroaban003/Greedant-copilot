/**
 * Chat Page Controller
 *
 * Initializes all components and wires them to the VS Code message bus.
 * This is the only file that knows about all components — it's the glue.
 *
 * Components used: MessageComponent, InputComponent, HeaderComponent
 * Shared: Icons
 */
(function () {
  "use strict";

  // @ts-ignore
  const vscode = acquireVsCodeApi();
  const extensionName = document.body.getAttribute("data-extension-name") || "Greedant";

  // ─── Initialize Components ────────────────────────────────────

  MessageComponent.init({
    container: document.getElementById("messagesContainer"),
    welcomeScreen: document.getElementById("welcomeScreen"),
    extensionName: extensionName,
  });

  InputComponent.init({
    onSend: function (content) {
      vscode.postMessage({ type: "sendMessage", content: content });
    },
  });

  HeaderComponent.init({
    onClear: function () {
      vscode.postMessage({ type: "clearChat" });
    },
  });

  // ─── Welcome Hints ────────────────────────────────────────────

  document.querySelectorAll(".welcome-hint").forEach(function (hint) {
    hint.addEventListener("click", function () {
      const prompt = hint.getAttribute("data-prompt");
      if (prompt) {
        InputComponent.setValue(prompt);
        InputComponent.submit();
      }
    });
  });

  // ─── Extension Message Handler ────────────────────────────────

  window.addEventListener("message", function (event) {
    const msg = event.data;

    switch (msg.type) {
      case "receiveMessage":
        MessageComponent.renderMessage(msg.message);
        if (msg.message.role !== "user") {
          MessageComponent.setRawContent(msg.message.id, msg.message.content);
        }
        break;

      case "streamChunk":
        MessageComponent.appendChunk(msg.messageId, msg.content);
        break;

      case "streamEnd":
        MessageComponent.endStream(msg.messageId);
        break;

      case "error":
        MessageComponent.showError(msg.error);
        break;

      case "setLoading":
        InputComponent.setLoading(msg.loading);
        break;

      case "clearChat":
        MessageComponent.clear();
        break;
    }
  });

  // ─── Ready ────────────────────────────────────────────────────

  vscode.postMessage({ type: "ready" });
  InputComponent.focus();
})();
