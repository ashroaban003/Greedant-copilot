/**
 * Input Component
 *
 * Manages the chat input area: textarea auto-resize,
 * keyboard shortcuts, send action, loading state.
 * Future: file attachments, slash commands, @mentions.
 */

// eslint-disable-next-line no-unused-vars
const InputComponent = (function () {
  "use strict";

  let _input = null;
  let _sendBtn = null;
  let _thinkingIndicator = null;
  let _isLoading = false;
  let _onSend = null;

  function autoResize() {
    _input.style.height = "auto";
    _input.style.height = Math.min(_input.scrollHeight, 120) + "px";
  }

  function send() {
    const content = _input.value.trim();
    if (!content || _isLoading) return;
    _input.value = "";
    _input.style.height = "auto";
    if (_onSend) _onSend(content);
  }

  return {
    /**
     * Initialize the input component.
     * @param {Object} options
     * @param {Function} options.onSend - Callback with message content string
     */
    init: function (options) {
      _input = document.getElementById("messageInput");
      _sendBtn = document.getElementById("sendBtn");
      _thinkingIndicator = document.getElementById("thinkingIndicator");
      _onSend = options.onSend || function () {};

      _input.addEventListener("input", autoResize);
      _input.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          send();
        }
      });
      _sendBtn.addEventListener("click", send);
    },

    /**
     * Set loading/thinking state.
     * @param {boolean} loading
     */
    setLoading: function (loading) {
      _isLoading = loading;
      _sendBtn.disabled = loading;
      _thinkingIndicator.classList.toggle("active", loading);
    },

    /** Focus the input field. */
    focus: function () {
      if (_input) _input.focus();
    },

    /**
     * Programmatically set input value (e.g. from welcome hints).
     * @param {string} text
     */
    setValue: function (text) {
      _input.value = text;
      autoResize();
    },

    /** Trigger a send programmatically. */
    submit: function () {
      send();
    },
  };
})();
