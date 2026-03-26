'use strict';

const Config = require('./config');
const log    = require('./logger');

// ── AI generation ─────────────────────────────────────────────────────────────

const AI_URL = 'https://api.deepseek.com/v1/chat/completions';

const SYSTEM_PROMPT =
  'You are a quiz question generator for students who are learning. ' +
  'Return ONLY a raw JSON array with no markdown fences or extra text. ' +
  'Each element: {"q":"question","options":["A","B","C","D"],"correct":0,"topic":"topic","explanation":"explanation"}. ' +
  '"correct" is the 0-based index of the correct option. Generate varied, clear questions. ' +
  'MATH FORMATTING RULES: ' +
  '1. Wrap ALL inline math expressions with \\( and \\), e.g. \\(x^2 + 1\\). ' +
  '2. Wrap display/block equations with \\[ and \\], e.g. \\[\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}\\]. ' +
  '3. Use LaTeX for ALL formulas in questions, options, AND explanations. Never use plain-text math like "x^2" — always use \\(x^2\\). ' +
  'EXPLANATION RULES: ' +
  '1. Every explanation MUST be understandable by a student learning the subject. ' +
  '2. For math questions: first state what the key symbols/terms mean, then show the solution steps, then state why the correct answer is right. ' +
  '3. Keep explanations concise but educational — a learner should understand the concept after reading it.';

/**
 * QuestionService — generates quiz questions from the DeepSeek AI API.
 * Throws an Error if generation fails for any reason; the caller is
 * responsible for aborting the game and notifying clients.
 */
const QuestionService = {
  /**
   * Return `count` questions using DeepSeek. Throws on any failure.
   *
   * @param {string} topicContext  Raw text pasted / uploaded by the host.
   * @param {number} count         Number of questions needed.
   * @returns {Promise<object[]>}
   */
  async generate(topicContext, count, difficulty = 'normal') {
    if (!Config.DEEPSEEK_API_KEY) {
      throw new Error('No API key configured — cannot generate questions.');
    }

    const contextChars = String(topicContext || '').slice(0, Config.LIMITS.AI_CONTEXT_CHARS);
    log.info('AI', `Requesting ${count} questions from DeepSeek (context: ${contextChars.length} chars, difficulty: ${difficulty})`);

    // Connectivity ping before the expensive request
    const pingOk = await this._ping();
    if (!pingOk) throw new Error('DeepSeek API is unreachable. Check your connection or API key.');

    return this._fetchQuestions(contextChars, count, difficulty);
  },

  // ── Private ────────────────────────────────────────────────────────────────

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
  async _fetchQuestions(contextChars, count, difficulty = 'normal') {
    const difficultyClause =
      difficulty === 'easy' ? 'Make questions straightforward and beginner-friendly.' :
      difficulty === 'hard' ? 'Make questions challenging, requiring specific or advanced knowledge.' :
                              'Make questions moderately challenging.';

    const userPrompt =
      `Generate ${count} multiple-choice quiz questions with 4 answer options ` +
      `based on this material:\n\n${contextChars}\n\n${difficultyClause}\n\n` +
      'IMPORTANT: Use LaTeX notation (with \\( \\) for inline and \\[ \\] for display math) for ALL mathematical expressions in questions, options, and explanations. ' +
      'Each explanation must teach the concept — explain symbols, show steps, and state why the answer is correct. ' +
      'Return ONLY a JSON array.';

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
        throw new Error(`AI request failed (HTTP ${res.status}).`);
      }

      const data  = await res.json();
      let raw     = data.choices?.[0]?.message?.content || '';
      raw         = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

      // Fix LaTeX backslashes that break JSON.parse():
      // After the outer API JSON is decoded, `raw` has literal backslashes
      // from LaTeX (\frac, \sqrt, \theta, etc.) that are invalid JSON escapes.
      // Strategy: protect the two structural JSON sequences (\\ and \"),
      //           then double every remaining backslash, then restore.
      raw = raw
        .replace(/\\\\/g, '\x00B\x00')    // protect existing \\
        .replace(/\\"/g,  '\x00Q\x00')    // protect existing \"
        .replace(/\\/g,   '\\\\')          // escape every remaining lone \
        .replace(/\x00B\x00/g, '\\\\')    // restore \\
        .replace(/\x00Q\x00/g, '\\"');     // restore \"

      const questions = JSON.parse(raw);

      if (!Array.isArray(questions) || questions.length === 0) {
        log.error('AI', 'Parsed response is not a valid array:', raw.slice(0, 200));
        throw new Error('AI returned an invalid response. Try again.');
      }

      // Validate and sanitize each question
      const validated = questions.filter((q, i) => {
        if (!q.q || !Array.isArray(q.options) || q.options.length < 2) {
          log.warn('AI', `Question ${i} missing required fields, skipping`);
          return false;
        }
        if (typeof q.correct !== 'number' || q.correct < 0 || q.correct >= q.options.length) {
          log.warn('AI', `Question ${i} has invalid correct index, skipping`);
          return false;
        }
        // Ensure explanation exists
        if (!q.explanation) {
          q.explanation = 'No explanation provided.';
        }
        return true;
      });

      if (validated.length === 0) {
        throw new Error('All AI-generated questions failed validation.');
      }

      log.info('AI', `Successfully generated ${validated.length} questions (${questions.length - validated.length} rejected)`);
      return validated.slice(0, count);
    } 
    catch (err) 
    {
      log.error('AI', 'Request exception:', err.message);
      throw err instanceof SyntaxError
        ? new Error('AI response could not be parsed. Try again.')
        : err;
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
