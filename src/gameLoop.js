'use strict';

const Config          = require('./config');
const log             = require('./logger');
const QuestionService = require('./questions');
const RoomHelpers     = require('./roomHelpers');

/**
 * GameLoop — drives the full lifecycle of a single game session:
 * countdown → questions → reveal → next question → game over.
 *
 * Each public method receives a `room` object and mutates it in place,
 * then broadcasts the appropriate messages.
 */
const GameLoop = {
  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Kick off a game for the given room.
   * Fetches (or generates) questions, runs the countdown, then starts Q1.
   *
   * @param {object} room
   */
  async startGame(room) {
    const count  = room.config.questionsPerGame;
    const hasCtx = !!(room.topicContext && Config.DEEPSEEK_API_KEY);

    log.info('Game', `Room ${room.code} — starting: ${count} questions, ${room.config.roundDuration}s/q, AI: ${hasCtx}`);

    room.state = 'starting';
    RoomHelpers.broadcast(room, { type: 'game_starting', countdown: 3 });

    if (hasCtx) {
      RoomHelpers.broadcast(room, { type: 'status', msg: 'AI is generating questions from your content…' });
      room.questions = await QuestionService.generate(room.topicContext, count);
    } else {
      room.questions = await QuestionService.generate('', count);
      if (room.topicContext && !Config.DEEPSEEK_API_KEY) {
        log.warn('Game', `Room ${room.code} — context set but DEEPSEEK_API_KEY missing; using fallback`);
      }
    }

    log.info('Game', `Room ${room.code} — ${room.questions.length} questions ready`);

    // Wait for the client countdown to finish before showing Q1
    await new Promise(r => setTimeout(r, 3000));
    room.state    = 'playing';
    room.currentQ = 0;
    this._runQuestion(room);
  },

  // ── Private ────────────────────────────────────────────────────────────────

  /**
   * Broadcast the current question and start the server-side timer.
   * Called recursively via revealAnswer → setTimeout.
   *
   * @param {object} room
   */
  _runQuestion(room) {
    if (room.currentQ >= room.questions.length) {
      this._endGame(room);
      return;
    }

    const q   = room.questions[room.currentQ];
    const dur = room.config.roundDuration;

    log.info('Game', `Room ${room.code} — Q${room.currentQ + 1}/${room.questions.length}: "${q.q.slice(0, 60)}…"`);

    room.qStartTime = Date.now();

    // Reset answered flag for all players
    for (const p of room.players.values()) p.answered = false;

    RoomHelpers.broadcast(room, {
      type:     'question',
      index:    room.currentQ,
      total:    room.questions.length,
      question: q.q,
      options:  q.options,
      topic:    q.topic || '',
      duration: dur,
    });

    // Server-side countdown: sends timer ticks and auto-triggers reveal
    let remaining = dur;
    room._timerInterval = setInterval(() => {
      if (room.state !== 'playing') {
        clearInterval(room._timerInterval);
        return;
      }

      remaining -= 1;
      RoomHelpers.broadcast(room, { type: 'timer', remaining });

      const allAnswered = Array.from(room.players.values()).every(p => p.answered);
      const timeUp      = remaining <= 0;

      if (timeUp || allAnswered) {
        clearInterval(room._timerInterval);
        if (allAnswered) log.debug('Game', `Room ${room.code} — all answered early (${dur - remaining}s elapsed)`);
        else             log.debug('Game', `Room ${room.code} — time up on Q${room.currentQ + 1}`);
        this._revealAnswer(room);
      }
    }, 1000);
  },

  /**
   * Broadcast the correct answer + leaderboard, then schedule the next question.
   *
   * @param {object} room
   */
  _revealAnswer(room) {
    if (room.currentQ >= room.questions.length) return;

    const q          = room.questions[room.currentQ];
    const correctIdx = q.correct;

    const results = Array.from(room.players.values()).map(p => ({
      pid:     p.pid,
      name:    p.name,
      answered: p.answered,
      correct: p.lastCorrect,
      score:   p.score,
      streak:  p.streak,
    }));

    log.debug('Game', `Room ${room.code} — reveal Q${room.currentQ + 1}, correct: option ${correctIdx} (${q.options[correctIdx]})`);

    RoomHelpers.broadcast(room, {
      type:          'reveal',
      correct_index: correctIdx,
      explanation:   q.explanation || '',
      results,
      leaderboard:   RoomHelpers.leaderboard(room),
    });

    room._revealTimeout = setTimeout(() => {
      room.currentQ += 1;
      if (room.state === 'playing') this._runQuestion(room);
    }, Config.DEFAULTS.REVEAL_WAIT);
  },

  /**
   * Broadcast the game-over message with the final leaderboard.
   *
   * @param {object} room
   */
  _endGame(room) {
    room.state    = 'results';
    const board   = RoomHelpers.leaderboard(room);
    const winner  = board[0] || null;

    log.info('Game', `Room ${room.code} — game over. Winner: ${winner?.name ?? 'none'} (${winner?.score ?? 0} pts)`);

    RoomHelpers.broadcast(room, {
      type:        'game_over',
      leaderboard: board,
      winner,
    });
  },
};

module.exports = GameLoop;
