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

      // ── Identity ──────────────────────────────────────────
      case 'connected':
        App.state.myPid = m.pid;
        break;

      // ── Room lifecycle ────────────────────────────────────
      case 'created':
        App.lobby.setCode(m.code);
        App.lobby.showAsHost();
        App.screens.show('screen-lobby');
        break;

      case 'joined':
        App.lobby.setCode(m.code);
        App.lobby.showAsPlayer();
        App.screens.show('screen-lobby');
        break;

      case 'room_state':
        App.renderer.renderPlayers(m.players, m.state, App.state.myPid);
        if (m.state === 'playing' && m.players?.length) {
          App.renderer.renderLeaderboard(m.players, 'game-lb', App.state.myPid);
          Utils.q('#game-lb-card').style.display = '';
        }
        break;

      case 'player_left':
        App.toast.show(m.name + ' left the room');
        break;

      // ── Lobby notices ─────────────────────────────────────
      case 'context_set':
        Utils.setNotice(
          'lobby-notice',
          'AI source is ready — questions will be generated from your content.',
          'ok'
        );
        break;

      case 'status':
        Utils.setNotice('lobby-notice', m.msg, 'info');
        break;

      // ── Game flow ─────────────────────────────────────────
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
        // Timer is client-driven; server sync message is intentionally ignored.
        break;

      case 'answer_result':
        // Store result — it will be read when the reveal arrives.
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

      case 'file_text':
        App.lobby.handleFileText(m);
        break;

      // ── Errors ────────────────────────────────────────────
      case 'game_error':
        App.countdown.hide();
        App.toast.show(m.msg, 'err');
        break;

      case 'error':
        App.toast.show(m.msg, 'err');
        break;

      case 'rooms_update':
        renderLiveRooms(m.rooms);
        break;
    }
  }
}
