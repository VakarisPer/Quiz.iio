'use strict';

const Config        = require('./config');
const log           = require('./logger');
const Utils         = require('./utils');
const PlayerFactory = require('./player');
const RoomStore     = require('./roomStore');
const RoomHelpers   = require('./roomHelpers');
const GameLoop      = require('./gameLoop');

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
      case 'set_context': return this._setContext(ws, pid, msg, room, code);
      case 'start_game':  return this._startGame(ws, pid, msg, room, code);
      case 'answer':      return this._answer(ws, pid, msg, room, code);
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
      config: {
        roundDuration:     Config.DEFAULTS.ROUND_DURATION,
        questionsPerGame:  Config.DEFAULTS.QUESTIONS_PER_GAME,
      },
      _timerInterval: null,
      _revealTimeout: null,
    };

    RoomStore.rooms.set(code, room);
    RoomStore.pidToRoom.set(pid, code);
    log.info('Room', `${code} created by ${name} (${pid})`);

    RoomHelpers.sendTo(player, { type: 'created', code, pid, name });
    RoomHelpers.sendTo(player, RoomHelpers.roomSnapshot(room));
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

    const player = PlayerFactory.create(ws, pid, name);
    room.players.set(pid, player);
    RoomStore.pidToRoom.set(pid, code);
    log.info('Room', `${code} — ${name} (${pid}) joined (${room.players.size} total)`);

    RoomHelpers.sendTo(player, { type: 'joined', code, pid, name });
    RoomHelpers.broadcast(room, { type: 'player_joined', pid, name }, pid);
    RoomHelpers.broadcast(room, RoomHelpers.roomSnapshot(room));
  },

  _setContext(ws, pid, msg, room, code) {
    if (!this._requireRoom(ws, pid, room)) return;
    if (!this._requireHost(ws, pid, room, code)) return;

    room.topicContext = String(msg.context || '').slice(0, Config.LIMITS.MAX_CONTEXT_CHARS);
    log.info('Room', `${code} — AI context set by host (${room.topicContext.length} chars)`);

    RoomHelpers.broadcast(room, { type: 'context_set', msg: 'AI source saved.' });
    RoomHelpers.broadcast(room, RoomHelpers.roomSnapshot(room));
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
    GameLoop.startGame(room);
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
    RoomHelpers.broadcast(room, {
      type:           'player_answered',
      pid,
      answered_count: answeredCount,
      total:          room.players.size,
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
    return false;
  },

  // ── Helpers ────────────────────────────────────────────────────────────────

  _error(ws, msg) {
    try { ws.send(JSON.stringify({ type: 'error', msg })); } catch { /* dead socket */ }
  },

  _sanitizeName(raw) {
    return String(raw || 'Player').slice(0, Config.LIMITS.MAX_NAME_LEN).trim() || 'Player';
  },
};

module.exports = MessageHandler;
