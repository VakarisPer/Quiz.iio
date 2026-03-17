'use strict';

/**
 * PlayerFactory — creates fresh player state objects.
 *
 * Keeping construction in one place means adding a new field
 * (e.g. "powerUps") only requires a change here.
 */
const PlayerFactory = {
  /**
   * Build a new player record.
   *
   * @param {import('ws')} ws   Live WebSocket for this player.
   * @param {string}       pid  Unique player ID (from Utils.makePid).
   * @param {string}       name Display name chosen by the player.
   * @returns {object}
   */
  create(ws, pid, name) {
    return {
      ws,
      pid,
      name,
      score:       0,
      streak:      0,
      answered:    false,
      answerTime:  0,
      lastCorrect: false,
    };
  },
};

module.exports = PlayerFactory;
