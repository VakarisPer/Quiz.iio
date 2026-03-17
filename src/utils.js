'use strict';

/**
 * Utils — stateless helper functions for ID and code generation.
 */
const Utils = {
  /**
   * Generate a random 5-character room code using an
   * unambiguous character set (no O/0, I/1, L).
   * @returns {string}
   */
  makeCode() {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < 5; i++)
      out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  },

  /**
   * Generate a random player ID with a "p_" prefix.
   * @returns {string}
   */
  makePid() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let out = 'p_';
    for (let i = 0; i < 8; i++)
      out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  },
};

module.exports = Utils;
