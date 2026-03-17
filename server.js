'use strict';

/**
 * server.js — entry point.
 *
 * Wires together HttpServer + WsServer and starts listening.
 * All application logic lives in src/; this file is intentionally thin.
 *
 * Run:  node server.js
 */

const Config     = require('./src/config');
const log        = require('./src/logger');
const HttpServer = require('./src/httpServer');
const WsServer   = require('./src/wsServer');

// ── Boot ──────────────────────────────────────────────────────────────────────

const httpServer = new HttpServer();
new WsServer(httpServer.server); // attaches WebSocket upgrade handler

httpServer.server.listen(Config.PORT, () => {
  log.info('Server', `QuizForge listening on http://localhost:${Config.PORT}`);
  log.info('Server', `DeepSeek AI: ${Config.DEEPSEEK_API_KEY ? 'ENABLED (key present)' : 'DISABLED (set DEEPSEEK_API_KEY in .env)'}`);
  log.info('Server', `Log level: ${Config.LOG_LEVEL} (set LOG_LEVEL=DEBUG for verbose output)`);
});

// ── Process-level error guards ────────────────────────────────────────────────

process.on('unhandledRejection', (reason, promise) => {
  log.error('Process', 'Unhandled rejection at:', promise, 'reason:', reason);
});

process.on('SIGINT',  () => { log.info('Server', 'Shutting down…'); process.exit(0); });
process.on('SIGTERM', () => { log.info('Server', 'Shutting down…'); process.exit(0); });
