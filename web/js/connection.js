'use strict';

/**
 * ConnectionManager — owns the WebSocket: connects, reconnects,
 * serialises outgoing messages, and dispatches incoming ones.
 */
class ConnectionManager {
  /**
   * @param {function(object): void} onMessage  Called with each parsed message object.
   */
  constructor(onMessage) {
    this._ws        = null;
    this._onMessage = onMessage;
    this._url       = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
    this._heartbeatTimer = null;
    this._pongTimer      = null;
    this._awaitingPong   = false;
  }

  /** Open the WebSocket; automatically retries on close/error. */
  connect() {
    this._setStatus('pending', 'Connecting...');
    try {
      this._ws = new WebSocket(this._url);
    } catch {
      this._setStatus('err', 'Cannot reach server');
      setTimeout(() => this.connect(), 4000);
      return;
    }

    this._ws.onopen    = () => {
      this._setStatus('ok', 'Connected');
      this._startHeartbeat();
    };
    this._ws.onclose   = () => {
      this._stopHeartbeat();
      this._setStatus('err', 'Disconnected — retrying...');
      setTimeout(() => this.connect(), 3000);
    };
    this._ws.onerror   = () => this._setStatus('err', 'Connection error');
    this._ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.type === 'pong') {
        this._handlePong();
        return;
      }
      this._onMessage(m);
    };
  }

  /**
   * Serialise `obj` to JSON and send it over the socket.
   * @param {object} obj
   */
  send(obj) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(obj));
    } else {
      App.toast.show('Not connected to server. Please wait...', 'err');
    }
  }

  // ── private ──────────────────────────────────────────────

  _setStatus(state, text) {
    const dot = Utils.q('#conn-dot');
    const lbl = Utils.q('#conn-text');
    if (!dot) return;
    dot.className  = 'conn-dot ' + state;
    lbl.textContent = text;
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this._heartbeatTimer = setInterval(() => {
      if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return;

      if (this._awaitingPong) {
        this._setStatus('err', 'Connection stalled — reconnecting...');
        try { this._ws.close(); } catch { /**/ }
        return;
      }

      this._awaitingPong = true;
      this._ws.send(JSON.stringify({ type: 'ping', sentAt: Date.now() }));
      this._pongTimer = setTimeout(() => {
        if (!this._awaitingPong || !this._ws || this._ws.readyState !== WebSocket.OPEN) return;
        this._setStatus('err', 'Connection stalled — reconnecting...');
        try { this._ws.close(); } catch { /**/ }
      }, 10000);
    }, 20000);
  }

  _stopHeartbeat() {
    clearInterval(this._heartbeatTimer);
    clearTimeout(this._pongTimer);
    this._heartbeatTimer = null;
    this._pongTimer = null;
    this._awaitingPong = false;
  }

  _handlePong() {
    this._awaitingPong = false;
    clearTimeout(this._pongTimer);
    this._pongTimer = null;
  }
}
