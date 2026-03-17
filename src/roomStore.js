'use strict';

/**
 * RoomStore — the two Maps that track live rooms and which room each
 * player belongs to. Centralised here so every module imports the same
 * instance instead of passing references around.
 *
 * @property {Map<string, object>} rooms      code → room object
 * @property {Map<string, string>} pidToRoom  pid  → room code
 */
const RoomStore = {
  /** code → room */
  rooms: new Map(),

  /** pid → room code */
  pidToRoom: new Map(),
};

module.exports = RoomStore;
