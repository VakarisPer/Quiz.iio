'use strict';

require('dotenv').config();

/**
 * Config — single source of truth for every environment variable
 * and tunable constant. Import this instead of reading process.env directly.
 */
const Config = {
  PORT: parseInt(process.env.PORT) || 3000,

  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || '',

  LOG_LEVEL: (process.env.LOG_LEVEL || 'INFO').toUpperCase(),

  /** Default game settings (host may override per room). */
  DEFAULTS: {
    ROUND_DURATION:     35,
    QUESTIONS_PER_GAME: 10,
    MIN_PLAYERS:        1,
    REVEAL_WAIT:        10_000, // ms between reveal and next question
  },

  /** Limits applied when validating host-submitted settings. */
  LIMITS: {
    MAX_QUESTIONS:    50,
    MIN_QUESTIONS:    1,
    MAX_ROUND_SEC:    120,
    MIN_ROUND_SEC:    5,
    MAX_CONTEXT_CHARS: 8_000,
    AI_CONTEXT_CHARS:  6_000,
    AI_MAX_TOKENS:     4_000,
    MAX_NAME_LEN:      20,
    MAX_CHAT_LEN:      120,
    MAX_AI_TOKENS_PING: 8,
  },
};

module.exports = Config;
