'use strict';

const http = require('http');
const path = require('path');
const fs   = require('fs');
const log  = require('./logger');

const MIME = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
  '.svg':  'image/svg+xml',
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
