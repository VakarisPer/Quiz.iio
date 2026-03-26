'use strict';

/**
 * Utils — lightweight DOM helpers used across all modules.
 * Exposed globally so every other module can call Utils.q() etc.
 */
const Utils = {
  /** @param {string} sel @returns {Element|null} */
  q(sel) { return document.querySelector(sel); },

  /** @param {string} sel @returns {NodeList} */
  qs(sel) { return document.querySelectorAll(sel); },

  /**
   * HTML-escape a value so it's safe to inject into innerHTML,
   * while preserving LaTeX delimiters that MathJax needs.
   */
  h(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  /**
   * Show / update a notice element, or hide it when text is empty.
   * @param {string} id   Element id (without #)
   * @param {string} text Content to display (empty = hide)
   * @param {'info'|'ok'|'err'} type
   */
  setNotice(id, text, type) {
    const el = this.q('#' + id);
    if (!el) return;
    if (!text) { el.classList.add('hidden'); return; }
    el.className = `notice notice-${type} mt12`;
    el.textContent = text;
    el.classList.remove('hidden');
  },
};
