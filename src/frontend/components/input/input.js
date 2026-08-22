/**
 * Input Component
 *
 * Manages the chat input area: textarea auto-resize,
 * keyboard shortcuts, send action, loading state,
 * and file attachments (images, PDFs).
 */

// eslint-disable-next-line no-unused-vars
const InputComponent = (function () {
  "use strict";

  let _input, _sendBtn, _thinkingIndicator, _attachBtn, _fileInput;
  let _filePreview, _filePreviewName, _filePreviewRemove;
  let _isLoading = false;
  let _selectedFile = null;
  let _onSend = null;

  function autoResize() {
    _input.style.height = "auto";
    _input.style.height = Math.min(_input.scrollHeight, 120) + "px";
  }

  function clearFile() {
    _selectedFile = null;
    _fileInput.value = "";
    _filePreview.classList.remove("visible");
    _input.placeholder = "Ask anything...";
  }

  async function send() {
    if (_isLoading) return;

    const content = _input.value.trim();

    // File upload flow
    if (_selectedFile) {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(",")[1];
        _onSend(content, { filename: _selectedFile.name, base64Data: base64 });
        _input.value = "";
        _input.style.height = "auto";
        clearFile();
      };
      reader.readAsDataURL(_selectedFile);
      return;
    }

    // Regular text message
    if (!content) return;
    _input.value = "";
    _input.style.height = "auto";
    _onSend(content, null);
  }

  return {
    init: function (options) {
      _input = document.getElementById("messageInput");
      _sendBtn = document.getElementById("sendBtn");
      _thinkingIndicator = document.getElementById("thinkingIndicator");
      _attachBtn = document.getElementById("attachBtn");
      _fileInput = document.getElementById("fileInput");
      _filePreview = document.getElementById("filePreview");
      _filePreviewName = document.getElementById("filePreviewName");
      _filePreviewRemove = document.getElementById("filePreviewRemove");

      _onSend = options.onSend || function () {};

      _input.addEventListener("input", autoResize);
      _input.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          send();
        }
      });

      _sendBtn.addEventListener("click", send);

      _attachBtn.addEventListener("click", function () {
        if (!_isLoading) _fileInput.click();
      });

      _fileInput.addEventListener("change", function (e) {
        const file = e.target.files?.[0];
        if (file) {
          _selectedFile = file;
          _filePreviewName.textContent = file.name;
          _filePreview.classList.add("visible");
          _input.placeholder = "Add a message (optional)...";
        }
      });

      _filePreviewRemove.addEventListener("click", clearFile);
    },

    setLoading: function (loading) {
      _isLoading = loading;
      _sendBtn.disabled = loading;
      _attachBtn.disabled = loading;
      _thinkingIndicator.classList.toggle("active", loading);
    },

    focus: function () {
      if (_input) _input.focus();
    },

    setValue: function (text) {
      _input.value = text;
      autoResize();
    },

    submit: function () {
      send();
    },
  };
})();
