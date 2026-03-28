'use strict';

/**
 * App — top-level namespace that owns every singleton instance.
 *
 * Load order in index.html must be:
 *   utils.js → state.js → toast.js → screens.js → connection.js
 *   → timer.js → countdown.js → renderer.js → lobby.js → game.js
 *   → messages.js → keyboard.js → app.js
 *
 * Any module can reference App.* once app.js has run.
 */
const App = (() => {
  // Instantiate all singletons.
  const state     = AppState;
  const toast     = new Toast();
  const screens   = new ScreenManager();
  const timer     = new TimerManager();
  const countdown = new CountdownOverlay();
  const renderer  = new GameRenderer();
  const lobby     = new LobbyController();
  const game      = new GameController();
  const handler   = new MessageHandler();
  const keyboard  = new KeyboardController();

  // ConnectionManager needs `handler` to be ready before messages arrive,
  // so it's created last and stored on the namespace before connect() is called.
  const conn = new ConnectionManager((msg) => handler.handle(msg));

  /** Fetch active player count from /api/stats and update the home screen. */
  function _updateActivePlayers() {
    fetch('/api/stats')
      .then(r => r.json())
      .then(data => {
        const el = document.getElementById('active-players-text');
        if (el) {
          const n = data.activePlayers || 0;
          el.textContent = n + ' player' + (n !== 1 ? 's' : '') + ' online';
        }
      })
      .catch(() => {});
  }

  /** Boot: attach keyboard listeners and open the WebSocket. */
  function init() {
    
    // Start music on first user interaction (browser requires a gesture)
    const _startMusic = () => {
      Sound.play();
      document.removeEventListener('click', _startMusic);
      document.removeEventListener('touchstart', _startMusic);
    };
    document.addEventListener('click', _startMusic);
    document.addEventListener('touchstart', _startMusic);

    keyboard.init();
    conn.connect();
    _updateActivePlayers();
    setInterval(_updateActivePlayers, 30000);
  }

  // Expose everything so modules can call App.toast.show(), etc.
  return { state, toast, screens, timer, countdown, renderer, lobby, game, conn, init };
})();

// ── Boot ──────────────────────────────────────────────────────
App.init();
