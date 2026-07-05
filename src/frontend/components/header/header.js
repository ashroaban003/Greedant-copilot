/**
 * Header Component
 *
 * Manages the top bar: logo, model label, action buttons.
 * Future: model picker dropdown, connection status indicator.
 */

// eslint-disable-next-line no-unused-vars
const HeaderComponent = (function () {
  "use strict";

  let _clearBtn = null;
  let _onClear = null;

  return {
    /**
     * Initialize the header component.
     * @param {Object} options
     * @param {Function} options.onClear - Callback when clear button is clicked
     */
    init: function (options) {
      _clearBtn = document.getElementById("clearBtn");
      _onClear = options.onClear || function () {};

      _clearBtn.addEventListener("click", function () {
        _onClear();
      });
    },

    /**
     * Update the displayed model label.
     * @param {string} label - e.g. "ollama · qwen2.5-coder:3b"
     */
    setModelLabel: function (label) {
      const el = document.getElementById("modelLabel");
      if (el) el.textContent = label;
    },
  };
})();
