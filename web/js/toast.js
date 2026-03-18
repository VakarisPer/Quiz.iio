'use strict';

/**
 * Toast — shows a brief dismissing notification at the bottom of the screen.
 */
class Toast {
  constructor() {
    this._timeout = null;
    this._el = Utils.q('#toast');
  }

  /**
   * @param {string} msg
   * @param {'ok'|'err'|'info'|''} type
   */
  show(msg, type = '') {
    const icons = { ok: '✓', err: '✕', info: 'ℹ' };
    const icon  = icons[type];
    this._el.innerHTML = icon
      ? `<span class="toast-icon">${icon}</span><span>${msg}</span>`
      : `<span>${msg}</span>`;
    this._el.className = `show${type ? ' t-' + type : ''}`;
    clearTimeout(this._timeout);
    this._timeout = setTimeout(() => this._el.classList.remove('show'), 3500);
  }
}
