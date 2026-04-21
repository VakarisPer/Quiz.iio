'use strict';

const QUIZZA_SESSION_KEY = 'quizza.session';

function readSavedSession() {
  try {
    return JSON.parse(localStorage.getItem(QUIZZA_SESSION_KEY) || '{}');
  } catch {
    return {};
  }
}

/**
 * AppState — single source of truth for identity / role flags.
 * All modules read/write through this object instead of scattered globals.
 */
const savedSession = readSavedSession();

const AppState = {
  /** Unique player ID assigned by the server. */
  myPid: null,

  /** Display name entered by this player. */
  myName: savedSession.myName || '',

  /** True when this client created the room. */
  isHost: savedSession.isHost === true,

  /** Room code of the current/last game (for rejoin). */
  roomCode: savedSession.roomCode || null,

  /** Stable reconnect token for reclaiming the same player slot. */
  rejoinKey: savedSession.rejoinKey || null,

  /** True while the client is trying to auto-rejoin after reconnect. */
  rejoinPending: false,

  /** Prevent repeating the reconnect hint on every question. */
  reconnectHintShown: false,

  hasReconnectSession() {
    return !!(this.roomCode && this.rejoinKey);
  },

  rememberRoom({ name, roomCode, rejoinKey, isHost }) {
    if (name !== undefined) this.myName = name;
    if (roomCode !== undefined) this.roomCode = roomCode;
    if (rejoinKey !== undefined) this.rejoinKey = rejoinKey;
    if (isHost !== undefined) this.isHost = isHost;
    this.rejoinPending = false;
    this.reconnectHintShown = false;
    this._persist();
  },

  clearRoom() {
    this.roomCode = null;
    this.rejoinKey = null;
    this.isHost = false;
    this.rejoinPending = false;
    this.reconnectHintShown = false;
    this._persist();
  },

  clearAll() {
    this.myPid = null;
    this.myName = '';
    this.roomCode = null;
    this.rejoinKey = null;
    this.isHost = false;
    this.rejoinPending = false;
    this.reconnectHintShown = false;
    this._persist();
  },

  _persist() {
    try {
      localStorage.setItem(QUIZZA_SESSION_KEY, JSON.stringify({
        myName: this.myName || '',
        roomCode: this.roomCode || null,
        rejoinKey: this.rejoinKey || null,
        isHost: this.isHost === true,
      }));
    } catch {
      // Storage can fail in privacy modes; reconnect still works in-page.
    }
  },
};
