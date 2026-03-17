'use strict';

const Config = require('./config');
const log    = require('./logger');

// ── Fallback question bank ────────────────────────────────────────────────────

const FALLBACK_QUESTIONS = [
  {
    q: 'What is the main building block of digital logic circuits?',
    options: ['Transistor', 'Capacitor', 'Resistor', 'Diode'],
    correct: 0,
    topic: 'Electronics',
    explanation: 'Transistors act as electronic switches and are the fundamental building block of all digital circuits.',
  },
  {
    q: 'Which data structure operates on a Last-In-First-Out (LIFO) principle?',
    options: ['Queue', 'Stack', 'Linked List', 'Tree'],
    correct: 1,
    topic: 'Data Structures',
    explanation: 'A stack is a LIFO structure — the last item pushed is the first one popped.',
  },
  {
    q: 'What does HTTP stand for?',
    options: [
      'HyperText Transfer Protocol',
      'High Traffic Text Protocol',
      'HyperText Transmission Process',
      'Hosted Text Transfer Protocol',
    ],
    correct: 0,
    topic: 'Networking',
    explanation: 'HTTP (HyperText Transfer Protocol) is the foundation of data communication on the web.',
  },
  {
    q: 'Which sorting algorithm has the best average-case time complexity?',
    options: ['Bubble Sort', 'Insertion Sort', 'Merge Sort', 'Selection Sort'],
    correct: 2,
    topic: 'Algorithms',
    explanation: 'Merge Sort achieves O(n log n) average-case performance, outperforming O(n²) algorithms on large datasets.',
  },
  {
    q: 'What does RAM stand for?',
    options: [
      'Random Access Memory',
      'Read And Modify',
      'Rapid Array Management',
      'Runtime Allocation Module',
    ],
    correct: 0,
    topic: 'Hardware',
    explanation: 'RAM (Random Access Memory) is volatile short-term memory used by a computer while it is running.',
  },
];

// ── AI generation ─────────────────────────────────────────────────────────────

const AI_URL = 'https://api.deepseek.com/v1/chat/completions';

const SYSTEM_PROMPT =
  'You are a quiz question generator. ' +
  'Return ONLY a raw JSON array with no markdown fences or extra text. ' +
  'Each element: {"q":"question","options":["A","B","C","D"],"correct":0,"topic":"topic","explanation":"explanation"}. ' +
  '"correct" is the 0-based index of the correct option. Generate varied, clear questions.';

/**
 * QuestionService — generates quiz questions either from the AI API
 * or falls back to the built-in bank when the key is absent or the
 * request fails.
 */
const QuestionService = {
  /**
   * Return `count` questions, using DeepSeek when a key + context are available.
   *
   * @param {string} topicContext  Raw text pasted / uploaded by the host.
   * @param {number} count         Number of questions needed.
   * @returns {Promise<object[]>}
   */
  async generate(topicContext, count) {
    if (!Config.DEEPSEEK_API_KEY) {
      log.warn('AI', 'No API key — using built-in fallback questions');
      return this._fallback(count);
    }

    const contextChars = String(topicContext || '').slice(0, Config.LIMITS.AI_CONTEXT_CHARS);
    log.info('AI', `Requesting ${count} questions from DeepSeek (context: ${contextChars.length} chars)`);

    // Connectivity ping before the expensive request
    const pingOk = await this._ping();
    if (!pingOk) return this._fallback(count);

    return this._fetchQuestions(contextChars, count);
  },

  // ── Private ────────────────────────────────────────────────────────────────

  _fallback(count) {
    return FALLBACK_QUESTIONS.slice(0, count);
  },

  /** Send a cheap 1-token request to confirm the API is reachable. */
  async _ping() {
    try {
      log.debug('AI', 'Pinging DeepSeek API…');
      const res = await fetch(AI_URL, {
        method:  'POST',
        headers: this._headers(),
        body: JSON.stringify({
          model:      'deepseek-chat',
          messages:   [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user',   content: 'Reply with the single word PONG.' },
          ],
          max_tokens:  Config.LIMITS.MAX_AI_TOKENS_PING,
          temperature: 0,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        log.error('AI', `Ping failed — HTTP ${res.status}: ${body.slice(0, 200)}`);
        return false;
      }

      log.debug('AI', 'Ping OK');
      return true;
    } catch (err) {
      log.error('AI', 'Ping exception:', err.message);
      return false;
    }
  },

  /** Send the full question-generation request to DeepSeek. */
  async _fetchQuestions(contextChars, count) {
    const userPrompt =
      `Generate ${count} multiple-choice quiz questions with 4 answer options ` +
      `based on this material:\n\n${contextChars}\n\nReturn ONLY a JSON array.`;

    try {
      const res = await fetch(AI_URL, {
        method:  'POST',
        headers: this._headers(),
        body: JSON.stringify({
          model:       'deepseek-chat',
          messages:    [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user',   content: userPrompt },
          ],
          max_tokens:  Config.LIMITS.AI_MAX_TOKENS,
          temperature: 0.7,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        log.error('AI', `Request failed — HTTP ${res.status}: ${body.slice(0, 300)}`);
        return this._fallback(count);
      }

      const data  = await res.json();
      let raw     = data.choices?.[0]?.message?.content || '';
      raw         = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const questions = JSON.parse(raw);

      if (!Array.isArray(questions) || questions.length === 0) {
        log.error('AI', 'Parsed response is not a valid array:', raw.slice(0, 200));
        return this._fallback(count);
      }

      log.info('AI', `Successfully generated ${questions.length} questions`);
      return questions.slice(0, count);
    } catch (err) {
      log.error('AI', 'Request exception:', err.message);
      return this._fallback(count);
    }
  },

  _headers() {
    return {
      Authorization:  `Bearer ${Config.DEEPSEEK_API_KEY}`,
      'Content-Type': 'application/json',
    };
  },
};

module.exports = QuestionService;
