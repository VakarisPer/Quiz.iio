'use strict';

const Config        = require('./config');
const log           = require('./logger');
const Utils         = require('./utils');
const PlayerFactory = require('./player');
const RoomStore     = require('./roomStore');
const RoomHelpers   = require('./roomHelpers');
const GameLoop      = require('./gameLoop');
const QuestionService = require('./questions');

const sanitize = s => String(s).replace(/[<>"'&]/g, '').trim().slice(0, 20);

/**
 * MessageHandler — routes every incoming WebSocket message to the
 * appropriate action. One method per message type keeps each handler
 * small, testable, and easy to extend.
 */
const MessageHandler = {
  /**
   * Entry point: look up the room for `pid` and dispatch to a handler.
   *
   * @param {import('ws')} ws
   * @param {string}       pid
   * @param {object}       msg  Parsed JSON from the client.
   */
  handle(ws, pid, msg) {
    const action = msg.type;
    const code   = RoomStore.pidToRoom.get(pid);
    const room   = code ? RoomStore.rooms.get(code) : null;

    log.debug('WS', `${pid} -> type="${action}"`);

    switch (action) {
      case 'create_room': return this._createRoom(ws, pid, msg);
      case 'join_room':   return this._joinRoom(ws, pid, msg);
      case 'rejoin_room': return this._rejoinRoom(ws, pid, msg);
      case 'set_context':      return this._setContext(ws, pid, msg, room, code);
      case 'update_settings':  return this._updateSettings(ws, pid, msg, room, code);
      case 'start_game':  return this._startGame(ws, pid, msg, room, code);
      case 'answer':      return this._answer(ws, pid, msg, room, code);
      case 'open_answer': return this._openAnswer(ws, pid, msg, room, code); 
      case 'set_question_mode': return this._setQuestionMode(ws, pid, msg, room, code); 
      case 'vote_skip':   return this._voteSkip(ws, pid, msg, room, code);
      case 'chat':        return this._chat(ws, pid, msg, room, code);
      case 'play_again':  return this._playAgain(ws, pid, msg, room, code);
      case 'leave_room':  return this._leaveRoom(ws, pid, room, code);
      default:
        log.warn('WS', `${pid} sent unknown action type="${action}"`);
    }
  },

  // ── Handlers ───────────────────────────────────────────────────────────────

  _createRoom(ws, pid, msg) {
    const name = this._sanitizeName(msg.name);

    let code = Utils.makeCode();
    while (RoomStore.rooms.has(code)) code = Utils.makeCode();

    const player = PlayerFactory.create(ws, pid, name);
    const room   = {
      code,
      hostPid:      pid,
      players:      new Map([[pid, player]]),
      state:        'lobby',
      questions:    [],
      currentQ:     0,
      qStartTime:   0,
      topicContext: '',
      isPrivate:    msg.private === true,
      updatedAt:    Date.now(),
      config: {
        roundDuration:     Config.DEFAULTS.ROUND_DURATION,
        questionsPerGame:  Config.DEFAULTS.QUESTIONS_PER_GAME,
      },
      settings: {
        maxPlayers: 0,
        difficulty: 'normal',
        language: 'English',
      },
      _timerInterval: null,
      _revealTimeout: null,
      skipVotes:      new Set(),
    };

    RoomStore.rooms.set(code, room);
    RoomStore.pidToRoom.set(pid, code);
    log.info('Room', `${code} created by ${name} (${pid})`);

    RoomHelpers.sendTo(player, { type: 'created', code, pid, name, rejoinKey: player.rejoinKey });
    RoomHelpers.sendTo(player, RoomHelpers.roomSnapshot(room));
    require('./wsServer').broadcastRoomsUpdate();
  },

  _joinRoom(ws, pid, msg) {
    const code  = String(msg.code || '').toUpperCase().trim();
    const name  = this._sanitizeName(msg.name);
    const room  = RoomStore.rooms.get(code);

    if (!room) {
      log.warn('Room', `Join failed — room "${code}" not found (${pid})`);
      this._error(ws, `Room "${code}" was not found. Check the code and try again.`);
      return;
    }
    if (room.state !== 'lobby') {
      log.warn('Room', `Join failed — room "${code}" already in state "${room.state}" (${pid})`);
      this._error(ws, 'That game has already started. Ask the host to start a new one.');
      return;
    }
    if (room.settings?.maxPlayers > 0 && room.players.size >= room.settings.maxPlayers) {
      log.warn('Room', `Join failed — room "${code}" is full (${room.players.size}/${room.settings.maxPlayers})`);
      this._error(ws, 'Room is full. Ask the host to increase the player limit.');
      return;
    }

    const player = PlayerFactory.create(ws, pid, name);
    room.players.set(pid, player);
    RoomStore.pidToRoom.set(pid, code);
    log.info('Room', `${code} — ${name} (${pid}) joined (${room.players.size} total)`);

    RoomHelpers.sendTo(player, { type: 'joined', code, pid, name, rejoinKey: player.rejoinKey });
    RoomHelpers.broadcast(room, { type: 'player_joined', pid, name: player.name }, pid);
    RoomHelpers.broadcast(room, RoomHelpers.roomSnapshot(room));
    require('./wsServer').broadcastRoomsUpdate();
  },

  _rejoinRoom(ws, pid, msg) {
    const code      = String(msg.code || '').toUpperCase().trim();
    const rejoinKey = String(msg.rejoinKey || '').trim();

    if (!/^[A-Z0-9]{5}$/.test(code)) {
      this._error(ws, 'Invalid room code.');
      return;
    }
    if (!rejoinKey) {
      this._error(ws, 'Reconnect session expired. Join the room again.');
      return;
    }

    const room = RoomStore.rooms.get(code);
    if (!room) {
      this._error(ws, `Room "${code}" was not found.`);
      return;
    }

    const player = RoomHelpers.rejoinPlayer(ws, pid, rejoinKey, code);
    if (!player) {
      this._error(ws, 'No reconnect slot was found for this session. Join the room again.');
      return;
    }

    const isHost = room.hostPid === pid;

    RoomHelpers.sendTo(player, {
      type: 'rejoined',
      code,
      pid,
      name: player.name,
      isHost,
      rejoinKey: player.rejoinKey,
    });
    RoomHelpers.sendTo(player, RoomHelpers.roomSnapshot(room));

    // If a question is active, re-send it
    if (room.state === 'playing' && room.currentQ < room.questions.length) {
      const q = room.questions[room.currentQ];
      RoomHelpers.sendTo(player, {
        type:     'question',
        index:    room.currentQ,
        total:    room.questions.length,
        question: q.q,
        options:  q.options || [],
        topic:    q.topic || '',
        duration: room.config.roundDuration,
        mode:     room.questionMode || 'multiple',
      });
    }

    RoomHelpers.broadcast(room, { type: 'player_joined', pid, name: player.name }, pid);
    RoomHelpers.broadcast(room, RoomHelpers.roomSnapshot(room));
    require('./wsServer').broadcastRoomsUpdate();
  },

  _setContext(ws, pid, msg, room, code) {
    if (!this._requireRoom(ws, pid, room)) return;
    if (!this._requireHost(ws, pid, room, code)) return;

    const rawContext    = String(msg.context || '').replace(/[<>"'&]/g, '').trim();
    const storedContext = rawContext.slice(0, Config.LIMITS.MAX_CONTEXT_CHARS);
    room.topicContext   = storedContext;
    room.topic          = 'Analyzing Topic';
    const topicLanguage = String(msg.language || room.settings?.language || 'English').slice(0, 20) || 'English';

    log.info('Room', `${code} — AI context set by host (${room.topicContext.length} chars), topic="${room.topic}"`);

    const notices = ['AI source saved.'];
    if (rawContext.length > Config.LIMITS.MAX_CONTEXT_CHARS) {
      notices.push(`Extra text was trimmed after ${Config.LIMITS.MAX_CONTEXT_CHARS} characters.`);
    } else if (room.topicContext.length > Config.LIMITS.AI_CONTEXT_CHARS) {
      notices.push(`The AI will use the first ${Config.LIMITS.AI_CONTEXT_CHARS} characters when generating questions.`);
    }

    RoomHelpers.broadcast(room, {
      type: 'context_set',
      msg: notices.join(' '),
      truncated: rawContext.length > Config.LIMITS.MAX_CONTEXT_CHARS,
      aiTrimmed: room.topicContext.length > Config.LIMITS.AI_CONTEXT_CHARS,
      storedChars: room.topicContext.length,
    });
    RoomHelpers.broadcast(room, RoomHelpers.roomSnapshot(room));
    require('./wsServer').broadcastRoomsUpdate();

    const requestedContext = room.topicContext;
    QuestionService.generateRoomTopic(requestedContext, topicLanguage)
      .then(topic => {
        if (room.topicContext !== requestedContext) return;
        room.topic = topic;
        log.info('Room', `${code} — room topic generated: "${room.topic}"`);
        RoomHelpers.broadcast(room, RoomHelpers.roomSnapshot(room));
        require('./wsServer').broadcastRoomsUpdate();
      })
      .catch(err => {
        log.warn('AI', `${code} — room topic generation failed: ${err.message}`);
      });
  },

  _updateSettings(ws, pid, msg, room, code) {
    if (!this._requireRoom(ws, pid, room)) return;
    if (!this._requireHost(ws, pid, room, code)) return;

    const maxPlayers = parseInt(msg.maxPlayers);
    const difficulty = msg.difficulty;
    const language   = msg.language;
    log.debug('Room', `${code} — updating settings: maxPlayers=${maxPlayers}, difficulty=${difficulty}, language=${language}`);

    room.settings.maxPlayers = Number.isFinite(maxPlayers) ? Math.max(0, maxPlayers) : 0;
    room.settings.difficulty = ['easy', 'normal', 'hard'].includes(difficulty) ? difficulty : 'normal';
    room.settings.language = language ? String(language).slice(0, 20) : 'English';

    log.debug('Room', `${code} — settings updated: maxPlayers=${room.settings.maxPlayers}, difficulty=${room.settings.difficulty}, language=${room.settings.language}`);
  },

  _startGame(ws, pid, msg, room, code) {
    if (!this._requireRoom(ws, pid, room)) return;
    if (!this._requireHost(ws, pid, room, code)) return;

    if (room.state !== 'lobby') {
      log.warn('Room', `${code} — start_game ignored, state="${room.state}"`);
      return;
    }
    if (room.players.size < Config.DEFAULTS.MIN_PLAYERS) {
      this._error(ws, `Need at least ${Config.DEFAULTS.MIN_PLAYERS} player to start.`);
      return;
    }

    // Validate and apply host settings
    const rawQ = parseInt(msg.questions);
    const rawT = parseInt(msg.timer);
    const lim  = Config.LIMITS;

    room.config.questionsPerGame = Number.isFinite(rawQ)
      ? Math.min(Math.max(rawQ, lim.MIN_QUESTIONS), lim.MAX_QUESTIONS)
      : Config.DEFAULTS.QUESTIONS_PER_GAME;

    room.config.roundDuration = Number.isFinite(rawT)
      ? Math.min(Math.max(rawT, lim.MIN_ROUND_SEC), lim.MAX_ROUND_SEC)
      : Config.DEFAULTS.ROUND_DURATION;

    log.info('Room', `${code} — configured: ${room.config.questionsPerGame} questions, ${room.config.roundDuration}s each`);
    room.questionMode = msg.questionMode === 'open' ? 'open' : 'multiple';
    log.info('Room', `${code} — configured: ${room.config.questionsPerGame} questions, ${room.config.roundDuration}s each, mode="${room.questionMode}"`);

    // If no context at all, abort and return everyone to lobby
    if (!room.topicContext || !room.topicContext.trim()) {
      log.warn('Room', `${code} — no topic context set, cannot start game`);
      this._error(ws, 'No content provided. Upload a file or type instructions before starting.');
      return;
    }

    GameLoop.startGame(room);
    require('./wsServer').broadcastRoomsUpdate();
  },

  _answer(ws, pid, msg, room, code) {
    if (!this._requireRoom(ws, pid, room)) return;

    const player = room.players.get(pid);
    if (!player) {
      log.warn('Game', `${code} — answer from unknown pid ${pid}`);
      return;
    }
    if (player.answered) {
      log.debug('Game', `${code} — duplicate answer from ${player.name}, ignored`);
      return;
    }
    if (room.state !== 'playing') {
      log.debug('Game', `${code} — answer outside playing state ("${room.state}"), ignored`);
      return;
    }
    if (room.currentQ >= room.questions.length) {
      log.warn('Game', `${code} — answer but currentQ (${room.currentQ}) >= questions.length`);
      return;
    }

    player.answered    = true;
    player.answerTime  = Date.now();

    const chosen     = Number.isFinite(msg.index) ? msg.index : parseInt(msg.index, 10);
    const correctIdx = room.questions[room.currentQ].correct;
    const elapsed    = (player.answerTime - room.qStartTime) / 1000;
    const timeLeft   = Math.max(0, room.config.roundDuration - elapsed);

    if (chosen === correctIdx) {
      const timeBonus   = Math.floor((timeLeft / room.config.roundDuration) * 400);
      player.streak    += 1;
      const streakBonus = Math.min(player.streak - 1, 5) * 100;
      const points      = 1000 + timeBonus + streakBonus;
      player.score     += points;
      player.lastCorrect = true;

      log.debug('Game', `${code} — ${player.name} CORRECT (+${points}, streak ${player.streak})`);
      RoomHelpers.sendTo(player, {
        type: 'answer_result', correct: true,
        points, streak: player.streak, score: player.score,
      });
    } else {
      player.streak      = 0;
      player.lastCorrect = false;
      log.debug('Game', `${code} — ${player.name} WRONG (chose ${chosen}, correct ${correctIdx})`);
      RoomHelpers.sendTo(player, {
        type: 'answer_result', correct: false,
        points: 0, streak: 0, score: player.score,
      });
    }

    const answeredCount = Array.from(room.players.values()).filter(p => p.answered).length;
    const connectedCount = Array.from(room.players.values()).filter(p => !p.disconnected).length;
    RoomHelpers.broadcast(room, {
      type:           'player_answered',
      pid,
      answered_count: answeredCount,
      total:          connectedCount,
    }, pid);
  },

  _chat(ws, pid, msg, room, code) {
    if (!this._requireRoom(ws, pid, room)) return;

    const player = room.players.get(pid);
    if (!player) return;

    const text = String(msg.text || '').slice(0, Config.LIMITS.MAX_CHAT_LEN).trim();
    if (!text) return;

    log.debug('Chat', `${code} — ${player.name}: ${text}`);
    RoomHelpers.broadcast(room, { type: 'chat', pid, name: player.name, text });
  },

  _voteSkip(ws, pid, msg, room, code) {
    if (!this._requireRoom(ws, pid, room)) return;
    if (room.state !== 'playing') return;

    // Only valid while the reveal countdown is active
    if (!room._revealTimeout) {
      log.debug('Game', `${code} — skip vote from ${pid} ignored (not in reveal phase)`);
      return;
    }

    if (!room.skipVotes) room.skipVotes = new Set();
    room.skipVotes.add(pid);

    const total  = Array.from(room.players.values()).filter(p => !p.disconnected).length;
    const needed = total; // all connected players must agree to skip
    const count  = room.skipVotes.size;

    log.debug('Game', `${code} — skip vote: ${count}/${needed}`);
    RoomHelpers.broadcast(room, { type: 'skip_votes', count, needed });

    if (count >= needed) {
      log.info('Game', `${code} — skip threshold reached, advancing`);
      room.skipVotes = new Set();
      GameLoop.advanceFromReveal(room);
    }
  },

  _playAgain(ws, pid, msg, room, code) {
    if (!this._requireRoom(ws, pid, room)) return;
    if (!this._requireHost(ws, pid, room, code)) return;

    if (room.state !== 'results' && room.state !== 'ended') {
      log.warn('Room', `${code} — play_again in unexpected state "${room.state}"`);
      return;
    }

    clearInterval(room._timerInterval);
    clearTimeout(room._revealTimeout);

    for (const p of room.players.values()) {
      p.score = 0; p.streak = 0; p.answered = false;
      p.answerTime = 0; p.lastCorrect = false;
    }

    room.state     = 'lobby';
    room.currentQ  = 0;
    room.questions = [];

    log.info('Room', `${code} — lobby reset by host, ${room.players.size} players`);
    RoomHelpers.broadcast(room, { type: 'lobby_reset' });
    RoomHelpers.broadcast(room, RoomHelpers.roomSnapshot(room));
  },

  _leaveRoom(ws, pid, room, code) {
    log.info('Room', `${code ?? '?'} — ${pid} requested leave`);
    RoomHelpers.removePlayer(pid);
  },

  // ── Guards ─────────────────────────────────────────────────────────────────

  /** Returns false (and sends an error) when pid has no room. */
  _requireRoom(ws, pid, room) {
    if (room) return true;
    log.warn('WS', `${pid} sent message but has no room`);
    this._error(ws, 'You are not in a room. Please create or join one.');
    return false;
  },

  /** Returns false (silently) when pid is not the host. */
  _requireHost(ws, pid, room, code) {
    if (pid === room.hostPid) return true;
    log.warn('Room', `${code} — non-host ${pid} tried a host-only action`);
    this._error(ws, 'Only the host can do that.');
    return false;
  },

  // ── Helpers ────────────────────────────────────────────────────────────────

  _error(ws, msg) {
    try { ws.send(JSON.stringify({ type: 'error', msg })); } catch { /* dead socket */ }
  },

  _sanitizeName(raw) {
    return sanitize(String(raw || 'Player')) || 'Player';
  },

  _setQuestionMode(ws, pid, msg, room, code) {
    if (!this._requireRoom(ws, pid, room)) return;
    if (!this._requireHost(ws, pid, room, code)) return;

    const mode = msg.mode === 'open' ? 'open' : 'multiple';
    room.questionMode = mode;

    log.info('Room', `${code} — question mode set to "${mode}" by host`);
    RoomHelpers.broadcast(room, { type: 'question_mode_set', mode });
  },

  _openAnswer(ws, pid, msg, room, code) {
    if (!this._requireRoom(ws, pid, room)) return;

    const player = room.players.get(pid);
    if (!player) return;
    if (player.answered) {
      log.debug('Game', `${code} — duplicate open answer from ${player.name}, ignored`);
      return;
    }
    if (room.state !== 'playing') {
      log.debug('Game', `${code} — open answer outside playing state, ignored`);
      return;
    }
    if (room.questionMode !== 'open') {
      log.warn('Game', `${code} — open_answer received but mode is not open`);
      return;
    }

    const answer = String(msg.answer || '').trim().slice(0, 200);
    if (!answer) {
      this._error(ws, 'Answer cannot be empty.');
      return;
    }

    log.debug('Game', `${code} — ${player.name} submitted open answer: "${answer}"`);
    GameLoop.submitOpenAnswer(room, pid, answer).catch(err =>
      log.error('Game', `${code} — open answer grading failed: ${err.message}`)
    );
  },

};

module.exports = MessageHandler;
