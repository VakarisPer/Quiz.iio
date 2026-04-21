'use strict';

const log       = require('./logger');
const RoomStore = require('./roomStore');

/**
 * Return a summary of all non-finished rooms for the live rooms feed.
 */
function getRoomsSummary(rooms) {
  const result = [];
  for (const r of rooms.values()) {
    if (r.state === 'results' || r.state === 'ended' || r.isPrivate) continue;
    result.push({
      code:    r.code,
      topic:   r.topic || 'General',
      q:       r.currentQ || 0,
      total:   r.config?.questionsPerGame || 10,
      players: r.players.size,
    });
  }
  return result;
}

// Remove rooms that have been finished or empty for more than 30 minutes
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [code, r] of RoomStore.rooms.entries()) {
    if ((r.state === 'results' || r.state === 'ended' || r.players.size === 0)
        && r.updatedAt < cutoff) {
      RoomStore.rooms.delete(code);
      log.info('Room', `Room ${code} expired and removed`);
    }
  }
}, 5 * 60 * 1000);

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
    room.updatedAt = Date.now();
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
      hostPid:     room.hostPid,
      players:     Array.from(room.players.values())
        .sort((a, b) => b.score - a.score)
        .map(p => ({
          pid:          p.pid,
          name:         p.name,
          score:        p.score,
          answered:     p.answered,
          streak:       p.streak,
          disconnected: !!p.disconnected,
        })),
      current_q:   room.currentQ,
      total_q:     room.questions.length,
      has_context: !!room.topicContext,
    };
  },

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  /**
   * Remove a player from their room.
   * During an active game, the player is kept as "disconnected" for 5 minutes
   * so they can rejoin. In lobby/results state, they are removed immediately.
   * Deletes the room entirely if all players are gone.
   *
   * @param {string} pid
   */
  removePlayer(pid) {
    const code = RoomStore.pidToRoom.get(pid);
    if (!code) return;

    const room = RoomStore.rooms.get(code);
    if (!room) return;

    const player = room.players.get(pid);
    if (!player) return;

    const name = player.name;

    // During an active game, keep the player slot for rejoin
    if (room.state === 'playing' || room.state === 'starting') {
      player.disconnected = true;
      player.disconnectedAt = Date.now();
      player.ws = { send() { throw new Error('disconnected'); }, readyState: 3 };
      RoomStore.pidToRoom.delete(pid);

      log.info('Room', `${code} — ${name} (${pid}) disconnected mid-game, holding slot for 5 min`);
      this.broadcast(room, { type: 'player_left', pid, name, disconnected: true });
      this.broadcast(room, this.roomSnapshot(room));

      // Schedule cleanup after 5 minutes if they haven't rejoined
      if (!room._rejoinTimers) room._rejoinTimers = {};
      room._rejoinTimers[pid] = setTimeout(() => {
        if (room.players.has(pid) && room.players.get(pid).disconnected) {
          room.players.delete(pid);
          this._migrateHost(room, pid, code);
          log.info('Room', `${code} — ${name} (${pid}) rejoin window expired, removed`);
          this.broadcast(room, { type: 'player_left', pid, name });
          this.broadcast(room, this.roomSnapshot(room));
          this._cleanupEmptyRoom(room, code);
        }
      }, 5 * 60 * 1000);
      return;
    }

    // Lobby or results — remove immediately
    room.players.delete(pid);
    RoomStore.pidToRoom.delete(pid);
    this._migrateHost(room, pid, code);

    log.info('Room', `${code} — player left: ${name} (${pid}), ${room.players.size} remaining`);
    this.broadcast(room, { type: 'player_left', pid, name });
    this.broadcast(room, this.roomSnapshot(room));

    this._cleanupEmptyRoom(room, code);
  },

  /** Delete a room if it has no active (connected) players. */
  _cleanupEmptyRoom(room, code) {
    const activePlayers = Array.from(room.players.values()).filter(p => !p.disconnected);
    if (activePlayers.length === 0) {
      if (room._revealTimeout) clearTimeout(room._revealTimeout);
      if (room._timerInterval) clearInterval(room._timerInterval);
      if (room._rejoinTimers) {
        Object.values(room._rejoinTimers).forEach(t => clearTimeout(t));
      }
      RoomStore.rooms.delete(code);
      log.info('Room', `${code} deleted (no active players)`);
    }
  },

  /**
   * Attempt to rejoin a disconnected player to a room.
   * Returns the player object if successful, null otherwise.
   *
   * @param {import('ws')} ws
   * @param {string} newPid
   * @param {string} rejoinKey
   * @param {string} code
   * @returns {object|null}
   */
  rejoinPlayer(ws, newPid, rejoinKey, code) {
    const room = RoomStore.rooms.get(code);
    if (!room) return null;

    // Find a disconnected player with a matching reconnect token.
    for (const [oldPid, player] of room.players.entries()) {
      if (player.disconnected && player.rejoinKey === rejoinKey) {
        // Clear the rejoin timeout
        if (room._rejoinTimers?.[oldPid]) {
          clearTimeout(room._rejoinTimers[oldPid]);
          delete room._rejoinTimers[oldPid];
        }

        // Swap the old pid for the new one
        room.players.delete(oldPid);
        player.ws = ws;
        player.pid = newPid;
        player.disconnected = false;
        delete player.disconnectedAt;
        room.players.set(newPid, player);
        RoomStore.pidToRoom.set(newPid, code);

        // Transfer host if the disconnected player was the host
        if (room.hostPid === oldPid) {
          room.hostPid = newPid;
        }

        log.info('Room', `${code} — ${player.name} rejoined (old pid: ${oldPid}, new pid: ${newPid})`);
        return player;
      }
    }
    return null;
  },

  _migrateHost(room, oldPid, code) {
    if (room.hostPid !== oldPid) return;

    const nextHost = Array.from(room.players.values()).find(player => !player.disconnected);
    if (!nextHost) return;

    room.hostPid = nextHost.pid;
    log.info('Room', `${code} — host migrated to ${nextHost.name} (${nextHost.pid})`);
    this.broadcast(room, { type: 'host_changed', pid: nextHost.pid, name: nextHost.name });
  },
};

module.exports = { ...RoomHelpers, getRoomsSummary };
