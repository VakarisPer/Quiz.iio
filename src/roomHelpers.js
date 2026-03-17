'use strict';

const log       = require('./logger');
const RoomStore = require('./roomStore');

/**
 * RoomHelpers — stateless utilities that operate on a room object.
 * All mutations go through these helpers so the logic stays in one place.
 */
const RoomHelpers = {
  // ── Messaging ───────────────────────────────────────────────────────────────

  /**
   * Send a message to every player in the room except `excludePid`.
   * Dead sockets are silently cleaned up.
   *
   * @param {object} room
   * @param {object} msg
   * @param {string} [excludePid]
   */
  broadcast(room, msg, excludePid = null) {
    const data = JSON.stringify(msg);
    const dead = [];

    for (const [pid, p] of room.players.entries()) {
      if (pid === excludePid) continue;
      try { p.ws.send(data); } catch { dead.push(pid); }
    }

    dead.forEach(pid => this.removePlayer(pid));
  },

  /**
   * Send a message to a single player.
   * Silently ignores closed sockets.
   *
   * @param {object} player
   * @param {object} msg
   */
  sendTo(player, msg) {
    try { player.ws.send(JSON.stringify(msg)); } catch { /* dead socket */ }
  },

  // ── Derived data ────────────────────────────────────────────────────────────

  /**
   * Return a sorted leaderboard array from the room's player map.
   *
   * @param {object} room
   * @returns {{ pid: string, name: string, score: number, streak: number }[]}
   */
  leaderboard(room) {
    return Array.from(room.players.values())
      .map(p => ({ pid: p.pid, name: p.name, score: p.score, streak: p.streak }))
      .sort((a, b) => b.score - a.score);
  },

  /**
   * Build a full room_state snapshot suitable for broadcasting.
   *
   * @param {object} room
   * @returns {object}
   */
  roomSnapshot(room) {
    return {
      type:        'room_state',
      code:        room.code,
      state:       room.state,
      players:     Array.from(room.players.values())
        .sort((a, b) => b.score - a.score)
        .map(p => ({
          pid:      p.pid,
          name:     p.name,
          score:    p.score,
          answered: p.answered,
          streak:   p.streak,
        })),
      current_q:   room.currentQ,
      total_q:     room.questions.length,
      has_context: !!room.topicContext,
    };
  },

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  /**
   * Remove a player from their room.
   * Deletes the room entirely if it becomes empty.
   *
   * @param {string} pid
   */
  removePlayer(pid) {
    const code = RoomStore.pidToRoom.get(pid);
    if (!code) return;

    const room = RoomStore.rooms.get(code);
    if (!room) return;

    if (room.players.has(pid)) {
      const name = room.players.get(pid).name;
      room.players.delete(pid);
      RoomStore.pidToRoom.delete(pid);

      log.info('Room', `${code} — player left: ${name} (${pid}), ${room.players.size} remaining`);
      this.broadcast(room, { type: 'player_left', pid, name });
      this.broadcast(room, this.roomSnapshot(room));
    }

    if (room.players.size === 0) {
      if (room._revealTimeout) clearTimeout(room._revealTimeout);
      if (room._timerInterval) clearInterval(room._timerInterval);
      RoomStore.rooms.delete(code);
      log.info('Room', `${code} deleted (empty)`);
    }
  },
};

module.exports = RoomHelpers;
