'use strict';

const Config = require('./config');

/** Numeric level → can compare with < / <= */
const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

const CURRENT = LEVELS[Config.LOG_LEVEL] ?? LEVELS.INFO;

/** ISO timestamp trimmed to milliseconds. */
function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 23);
}

/**
 * Logger — namespaced, colour-coded, level-filtered.
 *
 * Usage:
 *   const log = require('./logger');
 *   log.info('Room', 'ABC created');
 *   log.error('AI', 'Request failed', err.message);
 */
const log = {
  debug(cat, ...args) {
    if (CURRENT <= LEVELS.DEBUG)
      console.log(`\x1b[90m[${ts()}] [DEBUG] [${cat}]\x1b[0m`, ...args);
  },
  info(cat, ...args) {
    if (CURRENT <= LEVELS.INFO)
      console.log(`\x1b[36m[${ts()}] [INFO]  [${cat}]\x1b[0m`, ...args);
  },
  warn(cat, ...args) {
    if (CURRENT <= LEVELS.WARN)
      console.warn(`\x1b[33m[${ts()}] [WARN]  [${cat}]\x1b[0m`, ...args);
  },
  error(cat, ...args) {
    if (CURRENT <= LEVELS.ERROR)
      console.error(`\x1b[31m[${ts()}] [ERROR] [${cat}]\x1b[0m`, ...args);
  },
};

module.exports = log;
