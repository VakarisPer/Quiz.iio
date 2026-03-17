'use strict';

const WebSocket    = require('ws');
const log          = require('./logger');
const Utils        = require('./utils');
const RoomHelpers  = require('./roomHelpers');
const MessageHandler = require('./messageHandler');

/**
 * WsServer — wraps `ws.Server`, assigns player IDs on connect,
 * and forwards every incoming message to MessageHandler.
 */
class WsServer {
  /**
   * @param {import('http').Server} httpServer  The existing HTTP server to upgrade.
   */
  constructor(httpServer) {
    this._wss = new WebSocket.Server({ server: httpServer });
    this._wss.on('connection', (ws, req) => this._onConnection(ws, req));
  }

  // ── Private ────────────────────────────────────────────────────────────────

  _onConnection(ws, req) {
    const pid = Utils.makePid();
    const ip  = req.socket.remoteAddress;
    log.info('WS', `New connection: ${pid} from ${ip}`);

    // Let the client know its assigned ID
    ws.send(JSON.stringify({ type: 'connected', pid, version: 'node-2.0' }));

    ws.on('message', raw => this._onMessage(ws, pid, raw));
    ws.on('close',  (code) => this._onClose(pid, code));
    ws.on('error',  err   => log.error('WS', `Socket error for ${pid}:`, err.message));
  }

  _onMessage(ws, pid, raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      log.warn('WS', `${pid} sent invalid JSON: ${String(raw).slice(0, 80)}`);
      try { ws.send(JSON.stringify({ type: 'error', msg: 'Invalid JSON received.' })); } catch { /**/ }
      return;
    }
    MessageHandler.handle(ws, pid, msg);
  }

  _onClose(pid, code) {
    log.info('WS', `Disconnected: ${pid} (code ${code})`);
    RoomHelpers.removePlayer(pid);
  }
}

module.exports = WsServer;
