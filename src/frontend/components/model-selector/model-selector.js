/**
 * Model Selector Component
 *
 * Displays the currently active model as a chip and provides
 * a dropdown for switching between available models.
 */
// eslint-disable-next-line no-unused-vars
const ModelSelectorComponent = (function () {
  "use strict";

  let _chip = null;
  let _nameEl = null;
  let _dropdown = null;
  let _listEl = null;
  let _isOpen = false;
  let _models = [];
  let _activeModel = "";
  let _onSelect = null;
  let _onOpen = null;

  function toggle() {
    _isOpen ? close() : open();
  }

  function open() {
    if (_isOpen) return;
    _isOpen = true;
    _dropdown.hidden = false;
    _chip.setAttribute("aria-expanded", "true");
    renderList();
    if (_onOpen) _onOpen();
    document.addEventListener("click", handleOutsideClick, true);
    document.addEventListener("keydown", handleKeyDown, true);
  }

  function close() {
    if (!_isOpen) return;
    _isOpen = false;
    _dropdown.hidden = true;
    _chip.setAttribute("aria-expanded", "false");
    document.removeEventListener("click", handleOutsideClick, true);
    document.removeEventListener("keydown", handleKeyDown, true);
  }

  function handleOutsideClick(e) {
    var container = document.getElementById("modelSelectorContainer");
    if (!container.contains(e.target)) {
      close();
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Escape") {
      close();
      _chip.focus();
    }
  }

  function selectModel(model) {
    _activeModel = model;
    _nameEl.textContent = model;
    close();
    if (_onSelect) _onSelect(model);
  }

  function renderList() {
    _listEl.innerHTML = "";
    if (_models.length === 0) {
      var empty = document.createElement("div");
      empty.className = "model-dropdown-item";
      empty.textContent = "No models available";
      empty.style.opacity = "0.5";
      empty.style.cursor = "default";
      _listEl.appendChild(empty);
      return;
    }
    _models.forEach(function (model) {
      var btn = document.createElement("button");
      btn.className = "model-dropdown-item";
      btn.textContent = model;
      btn.setAttribute("role", "option");
      btn.setAttribute("aria-selected", model === _activeModel ? "true" : "false");
      btn.addEventListener("click", function () {
        selectModel(model);
      });
      _listEl.appendChild(btn);
    });
  }

  return {
    /**
     * Initialize the model selector component.
     * @param {Object} options
     * @param {Function} options.onSelect - Callback with selected model name
     * @param {Function} options.onOpen - Callback when dropdown opens (for refresh)
     */
    init: function (options) {
      _chip = document.getElementById("modelSelectorChip");
      _nameEl = document.getElementById("modelSelectorName");
      _dropdown = document.getElementById("modelDropdown");
      _listEl = document.getElementById("modelDropdownList");
      _onSelect = options.onSelect || function () {};
      _onOpen = options.onOpen || function () {};

      _chip.addEventListener("click", toggle);
    },

    /**
     * Update the available models and active model.
     * @param {string[]} models - Array of model name strings
     * @param {string} activeModel - Currently active model name
     */
    update: function (models, activeModel) {
      _models = models;
      _activeModel = activeModel;
      _nameEl.textContent = activeModel;
      if (_isOpen) {
        renderList();
      }
    },

    /** Get current active model name */
    getActiveModel: function () {
      return _activeModel;
    },
  };
})();
