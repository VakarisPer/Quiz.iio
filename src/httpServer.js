'use strict';

const http      = require('http');
const path      = require('path');
const fs        = require('fs');
const log       = require('./logger');
const RoomStore = require('./roomStore');

const MIME = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
  '.svg':  'image/svg+xml',
  '.wav':  'audio/wav',
  '.mp3':  'audio/mpeg',
  '.ogg':  'audio/ogg',
  '.xml':  'application/xml',
  '.txt':  'text/plain',
};

/**
 * HttpServer — serves static files from the `web/` directory.
 * The underlying `http.Server` is also used as the WebSocket upgrade target.
 */
class HttpServer {
  constructor() {
    /** Resolved path to the public web directory. */
    this.publicDir = path.join(__dirname, '..', 'web');

    /** The raw Node http.Server instance (passed to ws.Server). */
    this.server = http.createServer((req, res) => this._handle(req, res));
  }

  // ── Private ────────────────────────────────────────────────────────────────

  _handle(req, res) {
    // Security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    // Stats API
    if (req.url === '/api/stats') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ activePlayers: RoomStore.pidToRoom.size }));
      return;
    }

    // Normalise URL
    let urlPath = req.url === '/' ? '/index.html' : req.url;
    urlPath = urlPath.split('?')[0];

    const filePath = path.join(this.publicDir, urlPath);

    // Prevent path traversal
    if (!filePath.startsWith(this.publicDir)) {
      log.warn('HTTP', `Path traversal attempt: ${req.url}`);
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    const ext  = path.extname(filePath);
    const mime = MIME[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
      if (err) {
        log.debug('HTTP', `404: ${urlPath}`);
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }
      log.debug('HTTP', `200: ${urlPath}`);
      res.writeHead(200, { 'Content-Type': mime });
      res.end(data);
    });
  }
}

module.exports = HttpServer;
