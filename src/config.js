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
    SKIP_VOTE_FRACTION: 0.5,   // fraction of players required to skip (majority)
  },

  /** Limits applied when validating host-submitted settings. */
  LIMITS: {
  MAX_QUESTIONS:      50,
  MIN_QUESTIONS:      1,
  MAX_ROUND_SEC:      120,
  MIN_ROUND_SEC:      5,
  MAX_CONTEXT_CHARS:  480_000,    // ~120K tokens, just under DeepSeek's 128K ceiling
  AI_CONTEXT_CHARS:   380_000,    // Safe AI send limit (leaves room for system prompt)
  AI_MAX_TOKENS:      8_000,      // deepseek-chat hard max output
  MAX_NAME_LEN:       100,
  MAX_CHAT_LEN:       120,
  MAX_AI_TOKENS_PING: 8,
  MAX_FILE_BYTES:     50 * 1024 * 1024,  // 50
  CHUNK_SIZE_CHARS:   380_000,    // Chunk files before sending to AI 
  },
};

if (!Config.DEEPSEEK_API_KEY) {
  console.warn('[Config] WARNING: DEEPSEEK_API_KEY is not set. AI question generation will fail.');
}

module.exports = Config;
