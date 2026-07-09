/**
 * Message Component
 *
 * Core reusable component for rendering chat messages.
 * Handles: creating messages, streaming chunks, markdown formatting,
 * error display, and clearing.
 *
 * Can be instantiated for different containers (sidebar chat,
 * inline chat, notification feed, etc.)
 */

// eslint-disable-next-line no-unused-vars
const MessageComponent = (function () {
  "use strict";

  let _container = null;
  let _welcomeScreen = null;
  let _hasMessages = false;
  let _extensionName = "Greedant";

  // ─── Markdown Formatting ──────────────────────────────────────

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function formatMarkdown(text) {
    if (!text) return "";
    let html = escapeHtml(text);

    // Fenced code blocks: ```lang\n...\n```
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function (_, lang, code) {
      return "<pre><code>" + code.trim() + "</code></pre>";
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

    // Italic
    html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

    // Paragraphs (double newline) and line breaks
    html = html
      .split("\n\n")
      .map(function (p) {
        return "<p>" + p + "</p>";
      })
      .join("");
    html = html.replace(/\n/g, "<br>");

    return html;
  }

  // ─── DOM Helpers ──────────────────────────────────────────────

  function scrollToBottom() {
    requestAnimationFrame(function () {
      _container.scrollTop = _container.scrollHeight;
    });
  }

  function hideWelcome() {
    if (!_hasMessages && _welcomeScreen) {
      _welcomeScreen.style.display = "none";
      _hasMessages = true;
    }
  }

  function createAvatar(role) {
    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.setAttribute("aria-hidden", "true");

    if (role === "user") {
      avatar.textContent = "U";
    } else {
      avatar.innerHTML = Icons.get("logoSmall");
    }

    return avatar;
  }

  function createBody(msg) {
    const body = document.createElement("div");
    body.className = "message-body";

    const sender = document.createElement("div");
    sender.className = "message-sender";
    sender.textContent = msg.role === "user" ? "You" : _extensionName;

    const content = document.createElement("div");
    content.className = "message-content";
    content.innerHTML = formatMarkdown(msg.content);

    body.appendChild(sender);
    body.appendChild(content);
    return body;
  }

  // ─── Public API ───────────────────────────────────────────────

  return {
    /**
     * Initialize with a container and optional welcome screen.
     * @param {Object} options
     * @param {HTMLElement} options.container - Messages container element
     * @param {HTMLElement|null} options.welcomeScreen - Welcome element (hidden on first message)
     * @param {string} options.extensionName - Name shown on assistant messages
     */
    init: function (options) {
      _container = options.container;
      _welcomeScreen = options.welcomeScreen || null;
      _extensionName = options.extensionName || "Greedant";
    },

    /**
     * Render a message. Updates in-place if message ID already exists.
     * @param {Object} msg - { id, role, content, isStreaming?, isError? }
     */
    renderMessage: function (msg) {
      hideWelcome();

      const existing = document.getElementById("msg-" + msg.id);
      if (existing) {
        const content = existing.querySelector(".message-content");
        content.innerHTML = formatMarkdown(msg.content);
        existing.classList.toggle("streaming", !!msg.isStreaming);
        return;
      }

      const el = document.createElement("div");
      el.id = "msg-" + msg.id;
      el.className =
        "message " + msg.role +
        (msg.isError ? " error" : "") +
        (msg.isStreaming ? " streaming" : "");
      el.setAttribute("role", "article");

      el.appendChild(createAvatar(msg.role));
      el.appendChild(createBody(msg));
      _container.appendChild(el);
      scrollToBottom();
    },

    /**
     * Append a streaming text chunk to an existing message.
     * @param {string} messageId
     * @param {string} chunk
     */
    appendChunk: function (messageId, chunk) {
      const el = document.getElementById("msg-" + messageId);
      if (!el) return;

      const content = el.querySelector(".message-content");
      const rawText = (el.dataset.raw || "") + chunk;
      el.dataset.raw = rawText;
      content.innerHTML = formatMarkdown(rawText);
      scrollToBottom();
    },

    /**
     * Finalize a streamed message (removes cursor animation).
     * @param {string} messageId
     */
    endStream: function (messageId) {
      const el = document.getElementById("msg-" + messageId);
      if (!el) return;

      el.classList.remove("streaming");
      const content = el.querySelector(".message-content");
      const rawText = el.dataset.raw || content.textContent;
      content.innerHTML = formatMarkdown(rawText);
    },

    /**
     * Store raw content on a message element for streaming reference.
     * @param {string} messageId
     * @param {string} content
     */
    setRawContent: function (messageId, content) {
      const el = document.getElementById("msg-" + messageId);
      if (el) el.dataset.raw = content;
    },

    /**
     * Show an error message in the chat.
     * @param {string} error
     */
    showError: function (error) {
      hideWelcome();

      const el = document.createElement("div");
      el.className = "message error";
      el.id = "msg-error-" + Date.now();
      el.setAttribute("role", "alert");

      const avatar = document.createElement("div");
      avatar.className = "message-avatar";
      avatar.innerHTML = Icons.get("error");

      const body = document.createElement("div");
      body.className = "message-body";
      const content = document.createElement("div");
      content.className = "message-content";
      content.textContent = error;
      body.appendChild(content);

      el.appendChild(avatar);
      el.appendChild(body);
      _container.appendChild(el);
      scrollToBottom();
    },

    /**
     * Clear all messages and restore the welcome screen.
     */
    clear: function () {
      _container.innerHTML = "";
      if (_welcomeScreen) {
        _container.appendChild(_welcomeScreen);
        _welcomeScreen.style.display = "";
      }
      _hasMessages = false;
    },
  };
})();
