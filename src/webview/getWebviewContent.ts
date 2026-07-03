import * as vscode from "vscode";
import {
  EXTENSION_NAME,
  DEFAULT_PROVIDER,
  DEFAULT_OLLAMA_MODEL,
} from "../constants";

/**
 * Generates the full HTML content for the Greedant chat webview.
 * Modern, clean UI inspired by professional AI coding assistants.
 */
export function getWebviewContent(
  webview: vscode.Webview,
  extensionUri: vscode.Uri
): string {
  const nonce = getNonce();

  return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <title>${EXTENSION_NAME}</title>
  <style nonce="${nonce}">
    :root {
      --spacing-xs: 4px;
      --spacing-sm: 8px;
      --spacing-md: 12px;
      --spacing-lg: 16px;
      --spacing-xl: 20px;
      --radius-sm: 4px;
      --radius-md: 8px;
      --radius-lg: 12px;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif;
      font-size: 13px;
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      line-height: 1.5;
    }

    /* ═══════════════════════════════════════
       HEADER
    ═══════════════════════════════════════ */
    .header {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      padding: var(--spacing-md) var(--spacing-lg);
      border-bottom: 1px solid var(--vscode-panel-border);
      background: var(--vscode-sideBar-background);
      flex-shrink: 0;
      min-height: 44px;
    }

    .header-logo {
      width: 22px;
      height: 22px;
      flex-shrink: 0;
      opacity: 0.9;
    }

    .header-text {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    .header-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--vscode-foreground);
      letter-spacing: -0.2px;
    }

    .header-model {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      font-weight: 400;
    }

    .header-actions {
      margin-left: auto;
      display: flex;
      gap: var(--spacing-xs);
    }

    .header-btn {
      width: 26px;
      height: 26px;
      border: none;
      background: transparent;
      color: var(--vscode-descriptionForeground);
      border-radius: var(--radius-sm);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.12s ease;
    }

    .header-btn:hover {
      background: var(--vscode-toolbar-hoverBackground);
      color: var(--vscode-foreground);
    }

    .header-btn svg {
      width: 14px;
      height: 14px;
    }

    /* ═══════════════════════════════════════
       MESSAGES AREA
    ═══════════════════════════════════════ */
    .messages-container {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding: var(--spacing-lg);
      display: flex;
      flex-direction: column;
      gap: var(--spacing-xl);
    }

    .messages-container::-webkit-scrollbar {
      width: 5px;
    }

    .messages-container::-webkit-scrollbar-track {
      background: transparent;
    }

    .messages-container::-webkit-scrollbar-thumb {
      background-color: var(--vscode-scrollbarSlider-background);
      border-radius: 3px;
    }

    .messages-container::-webkit-scrollbar-thumb:hover {
      background-color: var(--vscode-scrollbarSlider-hoverBackground);
    }

    /* ═══════════════════════════════════════
       WELCOME SCREEN
    ═══════════════════════════════════════ */
    .welcome {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 32px var(--spacing-lg);
      flex: 1;
      text-align: center;
      gap: var(--spacing-lg);
    }

    .welcome-logo {
      width: 40px;
      height: 40px;
      opacity: 0.5;
    }

    .welcome h2 {
      font-size: 15px;
      font-weight: 600;
      color: var(--vscode-foreground);
      margin: 0;
    }

    .welcome p {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      line-height: 1.6;
      max-width: 240px;
    }

    .welcome-hints {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
      width: 100%;
      max-width: 260px;
      margin-top: var(--spacing-sm);
    }

    .welcome-hint {
      font-size: 11.5px;
      color: var(--vscode-descriptionForeground);
      padding: var(--spacing-sm) var(--spacing-md);
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: var(--radius-md);
      cursor: pointer;
      transition: all 0.12s ease;
      text-align: left;
    }

    .welcome-hint:hover {
      border-color: var(--vscode-focusBorder);
      color: var(--vscode-foreground);
    }

    /* ═══════════════════════════════════════
       MESSAGE ITEMS
    ═══════════════════════════════════════ */
    .message {
      display: flex;
      gap: var(--spacing-sm);
      animation: msgIn 0.2s ease;
      width: 100%;
    }

    @keyframes msgIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .message-avatar {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 600;
      margin-top: 2px;
    }

    .message.user .message-avatar {
      background: var(--vscode-textLink-foreground);
      color: var(--vscode-button-foreground, #fff);
    }

    .message.assistant .message-avatar {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      color: var(--vscode-foreground);
    }

    .message-avatar svg {
      width: 14px;
      height: 14px;
    }

    .message-body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .message-sender {
      font-size: 11px;
      font-weight: 600;
      color: var(--vscode-foreground);
      opacity: 0.7;
    }

    .message-content {
      font-size: 13px;
      line-height: 1.6;
      color: var(--vscode-foreground);
      word-wrap: break-word;
      overflow-wrap: break-word;
    }

    .message-content p {
      margin: 0 0 var(--spacing-sm) 0;
    }

    .message-content p:last-child {
      margin-bottom: 0;
    }

    /* Code blocks */
    .message-content pre {
      background: var(--vscode-textCodeBlock-background, var(--vscode-editor-background));
      border: 1px solid var(--vscode-panel-border);
      border-radius: var(--radius-sm);
      padding: var(--spacing-md);
      margin: var(--spacing-sm) 0;
      overflow-x: auto;
      font-family: var(--vscode-editor-font-family, "SF Mono", "Fira Code", monospace);
      font-size: 12px;
      line-height: 1.5;
      white-space: pre;
    }

    .message-content code {
      font-family: var(--vscode-editor-font-family, "SF Mono", "Fira Code", monospace);
      font-size: 12px;
      background: var(--vscode-textCodeBlock-background, var(--vscode-editor-background));
      padding: 1px 5px;
      border-radius: 3px;
    }

    .message-content pre code {
      background: none;
      padding: 0;
    }

    /* Streaming cursor */
    .streaming .message-content::after {
      content: "";
      display: inline-block;
      width: 7px;
      height: 15px;
      background: var(--vscode-textLink-foreground);
      margin-left: 2px;
      vertical-align: text-bottom;
      animation: cursorBlink 0.7s step-end infinite;
      border-radius: 1px;
    }

    @keyframes cursorBlink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0; }
    }

    /* Error messages */
    .message.error .message-content {
      color: var(--vscode-errorForeground);
      background: color-mix(in srgb, var(--vscode-errorForeground) 8%, transparent);
      padding: var(--spacing-sm) var(--spacing-md);
      border-radius: var(--radius-sm);
      border-left: 3px solid var(--vscode-errorForeground);
      font-size: 12px;
    }

    /* ═══════════════════════════════════════
       INPUT AREA
    ═══════════════════════════════════════ */
    .input-area {
      padding: var(--spacing-md) var(--spacing-lg) var(--spacing-lg);
      border-top: 1px solid var(--vscode-panel-border);
      flex-shrink: 0;
      background: var(--vscode-sideBar-background);
    }

    .input-box {
      display: flex;
      align-items: flex-end;
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      border-radius: var(--radius-md);
      padding: var(--spacing-sm) var(--spacing-sm) var(--spacing-sm) var(--spacing-md);
      transition: border-color 0.15s ease;
      gap: var(--spacing-xs);
    }

    .input-box:focus-within {
      border-color: var(--vscode-focusBorder);
    }

    .input-field {
      flex: 1;
      border: none;
      background: transparent;
      color: var(--vscode-input-foreground);
      font-family: inherit;
      font-size: 13px;
      line-height: 1.5;
      resize: none;
      outline: none;
      min-height: 22px;
      max-height: 120px;
      padding: 2px 0;
    }

    .input-field::placeholder {
      color: var(--vscode-input-placeholderForeground);
    }

    .send-btn {
      width: 28px;
      height: 28px;
      border: none;
      border-radius: var(--radius-sm);
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: all 0.12s ease;
      opacity: 0.9;
    }

    .send-btn:hover:not(:disabled) {
      opacity: 1;
      background: var(--vscode-button-hoverBackground);
    }

    .send-btn:disabled {
      opacity: 0.35;
      cursor: default;
    }

    .send-btn svg {
      width: 14px;
      height: 14px;
    }

    .input-hint {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      margin-top: 5px;
      padding-left: 2px;
      opacity: 0.7;
    }

    /* ═══════════════════════════════════════
       LOADING INDICATOR (subtle inline)
    ═══════════════════════════════════════ */
    .thinking-indicator {
      display: none;
      align-items: center;
      gap: 5px;
      padding: 2px 0 4px;
      height: 16px;
    }

    .thinking-indicator.active {
      display: flex;
    }

    .thinking-dots {
      display: flex;
      gap: 2px;
      align-items: center;
    }

    .thinking-dots span {
      width: 3px;
      height: 3px;
      border-radius: 50%;
      background: var(--vscode-descriptionForeground);
      animation: pulse 1.2s ease-in-out infinite;
    }

    .thinking-dots span:nth-child(1) { animation-delay: 0s; }
    .thinking-dots span:nth-child(2) { animation-delay: 0.15s; }
    .thinking-dots span:nth-child(3) { animation-delay: 0.3s; }

    @keyframes pulse {
      0%, 70%, 100% { opacity: 0.3; }
      35% { opacity: 1; }
    }

    .thinking-text {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      opacity: 0.7;
    }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="header">
    <svg class="header-logo" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M32 8C20 8 14 16 14 26c0 6 2 10 5 14 2 3 3 6 3 10v2h20v-2c0-4 1-7 3-10 3-4 5-8 5-14 0-10-6-18-18-18z" stroke="currentColor" stroke-width="2.5" fill="none"/>
      <circle cx="24" cy="26" r="3" fill="currentColor"/>
      <circle cx="40" cy="26" r="3" fill="currentColor"/>
      <path d="M26 34c2 2 4 3 6 3s4-1 6-3" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>
      <path d="M14 18c-3-3-7-4-9-2s-1 6 2 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>
      <path d="M50 18c3-3 7-4 9-2s1 6-2 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>
      <path d="M44 52c4 2 8 5 10 3s0-6-3-8" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>
    </svg>
    <div class="header-text">
      <span class="header-title">${EXTENSION_NAME}</span>
      <span class="header-model" id="modelLabel">${DEFAULT_PROVIDER} · ${DEFAULT_OLLAMA_MODEL}</span>
    </div>
    <div class="header-actions">
      <button class="header-btn" id="clearBtn" title="Clear chat">
        <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 12.5a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11zM5.5 7h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1 0-1z"/></svg>
      </button>
    </div>
  </div>

  <!-- Messages -->
  <div class="messages-container" id="messagesContainer">
    <div class="welcome" id="welcomeScreen">
      <svg class="welcome-logo" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M32 8C20 8 14 16 14 26c0 6 2 10 5 14 2 3 3 6 3 10v2h20v-2c0-4 1-7 3-10 3-4 5-8 5-14 0-10-6-18-18-18z" stroke="currentColor" stroke-width="2.5" fill="none"/>
        <circle cx="24" cy="26" r="3" fill="currentColor"/>
        <circle cx="40" cy="26" r="3" fill="currentColor"/>
        <path d="M26 34c2 2 4 3 6 3s4-1 6-3" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>
        <path d="M14 18c-3-3-7-4-9-2s-1 6 2 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>
        <path d="M50 18c3-3 7-4 9-2s1 6-2 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>
        <path d="M44 52c4 2 8 5 10 3s0-6-3-8" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>
      </svg>
      <h2>${EXTENSION_NAME}</h2>
      <p>Your local AI coding assistant. Ask me anything — I run entirely on your machine.</p>
      <div class="welcome-hints">
        <div class="welcome-hint" data-prompt="Explain how async/await works in JavaScript">Explain async/await in JavaScript</div>
        <div class="welcome-hint" data-prompt="Write a Python function to find duplicates in a list">Find duplicates in a Python list</div>
        <div class="welcome-hint" data-prompt="What are the SOLID principles?">What are the SOLID principles?</div>
      </div>
    </div>
  </div>

  <!-- Input -->
  <div class="input-area">
    <div class="thinking-indicator" id="thinkingIndicator">
      <div class="thinking-dots"><span></span><span></span><span></span></div>
      <span class="thinking-text">${EXTENSION_NAME} is thinking...</span>
    </div>
    <div class="input-box">
      <textarea class="input-field" id="messageInput" placeholder="Ask anything..." rows="1"></textarea>
      <button class="send-btn" id="sendBtn" title="Send (Enter)">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2L7 9"/>
          <path d="M14 2L9.5 14L7 9L2 6.5L14 2Z"/>
        </svg>
      </button>
    </div>
    <div class="input-hint">Enter to send · Shift+Enter for new line</div>
  </div>

  <script nonce="${nonce}">
    (function() {
      const vscode = acquireVsCodeApi();

      const messagesContainer = document.getElementById('messagesContainer');
      const welcomeScreen = document.getElementById('welcomeScreen');
      const messageInput = document.getElementById('messageInput');
      const sendBtn = document.getElementById('sendBtn');
      const clearBtn = document.getElementById('clearBtn');
      const thinkingIndicator = document.getElementById('thinkingIndicator');

      let isLoading = false;
      let hasMessages = false;

      // ─── Input handling ─────────────────────────────
      messageInput.addEventListener('input', autoResize);
      messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      });
      sendBtn.addEventListener('click', sendMessage);
      clearBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'clearChat' });
      });

      // Welcome hints
      document.querySelectorAll('.welcome-hint').forEach(hint => {
        hint.addEventListener('click', () => {
          const prompt = hint.getAttribute('data-prompt');
          if (prompt) {
            messageInput.value = prompt;
            sendMessage();
          }
        });
      });

      function autoResize() {
        messageInput.style.height = 'auto';
        messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
      }

      function sendMessage() {
        const content = messageInput.value.trim();
        if (!content || isLoading) return;
        messageInput.value = '';
        messageInput.style.height = 'auto';
        vscode.postMessage({ type: 'sendMessage', content });
      }

      // ─── Message rendering ─────────────────────────
      function hideWelcome() {
        if (!hasMessages && welcomeScreen) {
          welcomeScreen.style.display = 'none';
          hasMessages = true;
        }
      }

      function renderMessage(msg) {
        hideWelcome();

        const existing = document.getElementById('msg-' + msg.id);
        if (existing) {
          updateMessageContent(existing, msg);
          return;
        }

        const el = document.createElement('div');
        el.id = 'msg-' + msg.id;
        el.className = 'message ' + msg.role + (msg.isError ? ' error' : '') + (msg.isStreaming ? ' streaming' : '');

        // Avatar
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        if (msg.role === 'user') {
          avatar.textContent = 'U';
        } else {
          avatar.innerHTML = '<svg viewBox="0 0 64 64" fill="none"><path d="M32 8C20 8 14 16 14 26c0 6 2 10 5 14 2 3 3 6 3 10v2h20v-2c0-4 1-7 3-10 3-4 5-8 5-14 0-10-6-18-18-18z" stroke="currentColor" stroke-width="3" fill="none"/><circle cx="24" cy="26" r="2.5" fill="currentColor"/><circle cx="40" cy="26" r="2.5" fill="currentColor"/></svg>';
        }

        // Body
        const body = document.createElement('div');
        body.className = 'message-body';

        const sender = document.createElement('div');
        sender.className = 'message-sender';
        sender.textContent = msg.role === 'user' ? 'You' : '${EXTENSION_NAME}';

        const content = document.createElement('div');
        content.className = 'message-content';
        content.innerHTML = formatContent(msg.content);

        body.appendChild(sender);
        body.appendChild(content);
        el.appendChild(avatar);
        el.appendChild(body);
        messagesContainer.appendChild(el);
        scrollToBottom();
      }

      function updateMessageContent(el, msg) {
        const content = el.querySelector('.message-content');
        content.innerHTML = formatContent(msg.content);
        if (msg.isStreaming) {
          el.classList.add('streaming');
        } else {
          el.classList.remove('streaming');
        }
      }

      function appendToMessage(messageId, chunk) {
        const el = document.getElementById('msg-' + messageId);
        if (!el) return;
        const content = el.querySelector('.message-content');
        // Get raw text, append chunk, re-render
        const rawText = (el.dataset.raw || '') + chunk;
        el.dataset.raw = rawText;
        content.innerHTML = formatContent(rawText);
        scrollToBottom();
      }

      function endStream(messageId) {
        const el = document.getElementById('msg-' + messageId);
        if (!el) return;
        el.classList.remove('streaming');
        // Final render with complete content
        const content = el.querySelector('.message-content');
        const rawText = el.dataset.raw || content.textContent;
        content.innerHTML = formatContent(rawText);
      }

      function showError(error) {
        hideWelcome();
        const el = document.createElement('div');
        el.className = 'message error';
        el.id = 'msg-error-' + Date.now();

        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.innerHTML = '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 10.5a.75.75 0 110-1.5.75.75 0 010 1.5zM8.75 4v4.5h-1.5V4h1.5z"/></svg>';

        const body = document.createElement('div');
        body.className = 'message-body';
        const content = document.createElement('div');
        content.className = 'message-content';
        content.textContent = error;
        body.appendChild(content);

        el.appendChild(avatar);
        el.appendChild(body);
        messagesContainer.appendChild(el);
        scrollToBottom();
      }

      function clearMessages() {
        messagesContainer.innerHTML = '';
        messagesContainer.appendChild(welcomeScreen);
        welcomeScreen.style.display = '';
        hasMessages = false;
      }

      function setLoading(loading) {
        isLoading = loading;
        sendBtn.disabled = loading;
        thinkingIndicator.classList.toggle('active', loading);
      }

      function scrollToBottom() {
        requestAnimationFrame(() => {
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        });
      }

      // ─── Simple markdown formatting ─────────────────
      function formatContent(text) {
        if (!text) return '';
        let html = escapeHtml(text);

        // Code blocks: \`\`\`lang\\n...\\n\`\`\`
        html = html.replace(/\`\`\`(\\w*)\\n([\\s\\S]*?)\`\`\`/g, (_, lang, code) => {
          return '<pre><code>' + code.trim() + '</code></pre>';
        });

        // Inline code
        html = html.replace(/\`([^\`]+)\`/g, '<code>$1</code>');

        // Bold
        html = html.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>');

        // Italic
        html = html.replace(/\\*(.+?)\\*/g, '<em>$1</em>');

        // Line breaks to paragraphs
        html = html.split('\\n\\n').map(p => '<p>' + p + '</p>').join('');
        html = html.replace(/\\n/g, '<br>');

        return html;
      }

      function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
      }

      // ─── Message handler ────────────────────────────
      window.addEventListener('message', (event) => {
        const msg = event.data;
        switch (msg.type) {
          case 'receiveMessage':
            if (msg.message.role === 'user') {
              renderMessage(msg.message);
            } else {
              // For assistant messages, store raw content for streaming
              renderMessage(msg.message);
              const el = document.getElementById('msg-' + msg.message.id);
              if (el) el.dataset.raw = msg.message.content;
            }
            break;
          case 'streamChunk':
            appendToMessage(msg.messageId, msg.content);
            break;
          case 'streamEnd':
            endStream(msg.messageId);
            break;
          case 'error':
            showError(msg.error);
            break;
          case 'setLoading':
            setLoading(msg.loading);
            break;
          case 'clearChat':
            clearMessages();
            break;
        }
      });

      // Ready
      vscode.postMessage({ type: 'ready' });
      messageInput.focus();
    })();
  </script>
</body>
</html>`;
}

function getNonce(): string {
  let text = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
