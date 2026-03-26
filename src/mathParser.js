'use strict';

const pdfParse = require('pdf-parse');
const Config   = require('./config');
const log      = require('./logger');

// ── Mathpix OCR ─────────────────────────────────────────────────────────────

const MATHPIX_URL = 'https://api.mathpix.com/v3/pdf';

/**
 * Extract text + LaTeX from a PDF buffer using Mathpix OCR.
 * Returns the extracted text with formulas in LaTeX notation.
 * Throws on failure so the caller can fall back.
 */
async function extractWithMathpix(buffer, fileName) {
  if (!Config.MATHPIX_APP_ID || !Config.MATHPIX_APP_KEY) {
    throw new Error('Mathpix credentials not configured');
  }

  log.info('Mathpix', `Sending "${fileName}" (${(buffer.length / 1024).toFixed(0)} KB) to Mathpix…`);

  // Mathpix /v3/pdf accepts multipart form data
  const FormData = (await import('node-fetch')).FormData || globalThis.FormData;
  const { Blob } = require('buffer');

  const blob = new Blob([buffer], { type: 'application/pdf' });
  const form = new FormData();
  form.append('file', blob, fileName);
  form.append('options_json', JSON.stringify({
    conversion_formats: { text: true },
    math_inline_delimiters: ['\\(', '\\)'],
    math_display_delimiters: ['\\[', '\\]'],
    enable_tables_fallback: true,
  }));

  const res = await fetch(MATHPIX_URL, {
    method: 'POST',
    headers: {
      app_id:  Config.MATHPIX_APP_ID,
      app_key: Config.MATHPIX_APP_KEY,
    },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Mathpix HTTP ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();

  // Mathpix returns a pdf_id for async processing — poll until done
  if (data.pdf_id) {
    return _pollMathpixResult(data.pdf_id);
  }

  // Synchronous small-PDF response
  return data.text || '';
}

/**
 * Poll Mathpix for a completed PDF result (async processing).
 */
async function _pollMathpixResult(pdfId) {
  const url = `${MATHPIX_URL}/${pdfId}`;
  const maxAttempts = 30;    // 30 × 2s = 60s max wait
  const delayMs     = 2000;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, delayMs));

    const res = await fetch(url, {
      headers: {
        app_id:  Config.MATHPIX_APP_ID,
        app_key: Config.MATHPIX_APP_KEY,
      },
    });

    if (!res.ok) {
      throw new Error(`Mathpix poll HTTP ${res.status}`);
    }

    const data = await res.json();

    if (data.status === 'completed') {
      // Fetch the .txt conversion
      const txtRes = await fetch(`${url}.txt`, {
        headers: {
          app_id:  Config.MATHPIX_APP_ID,
          app_key: Config.MATHPIX_APP_KEY,
        },
      });
      if (!txtRes.ok) throw new Error(`Mathpix txt fetch HTTP ${txtRes.status}`);
      return await txtRes.text();
    }

    if (data.status === 'error') {
      throw new Error(`Mathpix processing error: ${data.error || 'unknown'}`);
    }

    log.debug('Mathpix', `Poll ${i + 1}/${maxAttempts} — status: ${data.status}`);
  }

  throw new Error('Mathpix processing timed out');
}

// ── Local fallback (pdf-parse) ──────────────────────────────────────────────

/**
 * Extract plain text from a PDF buffer using pdf-parse (no math awareness).
 */
async function extractTextLocal(buffer) {
  const data = await pdfParse(buffer);
  return data.text || '';
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Extract text from a PDF buffer. Tries Mathpix first for formula-aware
 * extraction, falls back to local pdf-parse if Mathpix is unavailable.
 *
 * @param {Buffer} buffer   Raw PDF bytes.
 * @param {string} fileName Original file name (for logging).
 * @returns {Promise<{ text: string, source: 'mathpix'|'local', warning?: string }>}
 */
async function extractFromPDF(buffer, fileName) {
  // Try Mathpix first
  if (Config.MATHPIX_APP_ID && Config.MATHPIX_APP_KEY) {
    try {
      const text = await extractWithMathpix(buffer, fileName);
      log.info('Mathpix', `"${fileName}" — extracted ${text.length} chars with formulas`);
      return { text, source: 'mathpix' };
    } catch (err) {
      log.warn('Mathpix', `"${fileName}" — failed: ${err.message}. Falling back to local.`);
    }
  }

  // Local fallback
  const text = await extractTextLocal(buffer);
  log.info('PDF', `"${fileName}" — extracted ${text.length} chars (local, no formula preservation)`);
  return {
    text,
    source: 'local',
    warning: 'PDF was extracted without formula recognition. Math expressions may be garbled.',
  };
}

module.exports = { extractFromPDF };
