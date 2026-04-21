'use strict';

/**
 * MessageHandler — single switch that routes every incoming server
 * message to the appropriate controller or helper.
 *
 * Adding support for a new message type = one new `case` here.
 */
class MessageHandler {
  /**
   * Dispatch a parsed message object received from the server.
   * @param {object} m
   */
  handle(m) {
    switch (m.type) {
      case 'connected':
        App.state.myPid = m.pid;
        if (App.state.hasReconnectSession()) {
          App.state.rejoinPending = true;
          App.toast.show('Trying to reconnect to room ' + App.state.roomCode + '...', 'info');
          App.conn.send({
            type: 'rejoin_room',
            code: App.state.roomCode,
            rejoinKey: App.state.rejoinKey,
          });
        }
        break;

      case 'created':
        App.state.rememberRoom({
          name: m.name,
          roomCode: m.code,
          rejoinKey: m.rejoinKey,
          isHost: true,
        });
        App.lobby.setCode(m.code);
        App.lobby.showAsHost();
        App.screens.show('screen-lobby');
        break;

      case 'joined':
        App.state.rememberRoom({
          name: m.name,
          roomCode: m.code,
          rejoinKey: m.rejoinKey,
          isHost: false,
        });
        App.lobby.setCode(m.code);
        App.lobby.showAsPlayer();
        App.screens.show('screen-lobby');
        break;

      case 'rejoined':
        App.state.rememberRoom({
          name: m.name,
          roomCode: m.code,
          rejoinKey: m.rejoinKey,
          isHost: m.isHost,
        });
        App.lobby.setCode(m.code);
        App.toast.show('Reconnected to the game!', 'ok');
        break;

      case 'room_state':
        App.renderer.renderPlayers(m.players, m.state, App.state.myPid, m.hostPid);
        App.state.isHost = m.hostPid === App.state.myPid;

        if (m.state === 'playing') {
          if (m.players?.length) {
            App.renderer.renderLeaderboard(m.players, 'game-lb', App.state.myPid);
            Utils.q('#game-lb-card').style.display = '';
          }
          App.screens.show('screen-game');
        } else if (m.state === 'lobby') {
          if (App.state.isHost) App.lobby.showAsHost();
          else App.lobby.showAsPlayer();
          App.screens.show('screen-lobby');
        } else if (m.state === 'results') {
          App.game.refreshResultActions();
        }
        break;

      case 'player_left':
        if (m.disconnected) {
          App.toast.show(m.name + ' disconnected. Their slot is reserved for 5 minutes.', 'info');
        } else {
          App.toast.show(m.name + ' left the room');
        }
        break;

      case 'host_changed':
        App.state.isHost = m.pid === App.state.myPid;
        if (App.state.isHost) App.toast.show('You are now the host for this room.', 'ok');
        else App.toast.show(m.name + ' is now the host.', 'info');
        App.game.refreshResultActions();
        break;

      case 'context_set':
        Utils.setNotice('ctx-saved-notice', m.msg || 'AI source saved.', m.truncated || m.aiTrimmed ? 'info' : 'ok');
        Utils.setNotice('lobby-notice', m.msg || 'AI source saved.', m.truncated || m.aiTrimmed ? 'info' : 'ok');
        break;

      case 'status':
        Utils.setNotice('lobby-notice', m.msg, 'info');
        break;

      case 'game_starting':
        Sound.play();
        App.countdown.show(m.countdown || 3);
        break;

      case 'question':
        Sound.play();
        App.countdown.hide();
        App.game.showQuestion(m);
        break;

      case 'timer':
        break;

      case 'answer_result':
        App.game.lastResult = m;
        break;

      case 'player_answered':
        App.game.updateAnsweredCount(m.answered_count, m.total);
        break;

      case 'skip_votes':
        App.game.updateSkipVotes(m.count, m.needed);
        break;

      case 'reveal':
        App.game.showReveal(m);
        if (m.leaderboard?.length) {
          App.renderer.renderLeaderboard(m.leaderboard, 'game-lb', App.state.myPid);
          Utils.q('#game-lb-card').style.display = '';
        }
        break;

      case 'game_over':
        Sound.play();
        App.game.showResults(m);
        break;

      case 'lobby_reset':
        App.timer.stop();
        App.game.stopRevealCountdown();
        App.lobby.reset();
        Utils.q('#game-lb-card').style.display = 'none';
        break;

      case 'game_error':
        App.countdown.hide();
        App.toast.show(m.msg, 'err');
        break;

      case 'error':
        if (App.state.rejoinPending) {
          App.state.clearRoom();
        }
        App.toast.show(m.msg, 'err');
        break;

      case 'rooms_update':
        renderLiveRooms(m.rooms);
        break;
    }
  }
}
