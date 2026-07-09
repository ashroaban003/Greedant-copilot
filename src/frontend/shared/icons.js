/**
 * Shared SVG icon registry.
 * Components call Icons.get('name') to get markup.
 * Keeps icon definitions DRY and swappable from one place.
 */

// eslint-disable-next-line no-unused-vars
var Icons = (function () {
  "use strict";

  var registry = {
    logo: '<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M32 8C20 8 14 16 14 26c0 6 2 10 5 14 2 3 3 6 3 10v2h20v-2c0-4 1-7 3-10 3-4 5-8 5-14 0-10-6-18-18-18z" stroke="currentColor" stroke-width="2.5" fill="none"/>' +
      '<circle cx="24" cy="26" r="3" fill="currentColor"/>' +
      '<circle cx="40" cy="26" r="3" fill="currentColor"/>' +
      '<path d="M26 34c2 2 4 3 6 3s4-1 6-3" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>' +
      '<path d="M14 18c-3-3-7-4-9-2s-1 6 2 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>' +
      '<path d="M50 18c3-3 7-4 9-2s1 6-2 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>' +
      '<path d="M44 52c4 2 8 5 10 3s0-6-3-8" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>' +
      '</svg>',

    logoSmall: '<svg viewBox="0 0 64 64" fill="none">' +
      '<path d="M32 8C20 8 14 16 14 26c0 6 2 10 5 14 2 3 3 6 3 10v2h20v-2c0-4 1-7 3-10 3-4 5-8 5-14 0-10-6-18-18-18z" stroke="currentColor" stroke-width="3" fill="none"/>' +
      '<circle cx="24" cy="26" r="2.5" fill="currentColor"/>' +
      '<circle cx="40" cy="26" r="2.5" fill="currentColor"/>' +
      '</svg>',

    clear: '<svg viewBox="0 0 16 16" fill="currentColor">' +
      '<path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 12.5a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11zM5.5 7h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1 0-1z"/>' +
      '</svg>',

    send: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M14 2L7 9"/>' +
      '<path d="M14 2L9.5 14L7 9L2 6.5L14 2Z"/>' +
      '</svg>',

    error: '<svg viewBox="0 0 16 16" fill="currentColor">' +
      '<path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 10.5a.75.75 0 110-1.5.75.75 0 010 1.5zM8.75 4v4.5h-1.5V4h1.5z"/>' +
      '</svg>',
  };

  return {
    /**
     * Get an icon's SVG markup by name.
     * @param {string} name - Icon key from the registry
     * @returns {string} SVG markup string
     */
    get: function (name) {
      return registry[name] || "";
    },
  };
})();
