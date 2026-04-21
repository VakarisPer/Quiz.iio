'use strict';

/**
 * GameRenderer — pure DOM-builder. No state, no network calls.
 * Every method receives all the data it needs and writes HTML.
 */
class GameRenderer {
  static LETTERS = ['A', 'B', 'C', 'D'];

  /**
   * Render the four answer-option buttons inside #g-options.
   * @param {string[]} opts  Array of option texts (up to 4).
   */
  renderOptions(opts) {
    Utils.q('#g-options').innerHTML = opts.map((o, i) => `
      <button class="option-btn" id="opt-${i}" onclick="App.game.pickAnswer(${i})">
        <span class="opt-letter">${GameRenderer.LETTERS[i]}</span><span class="opt-text">${Utils.h(o)}</span>
      </button>
    `).join('');
  }

  /**
   * Apply correct / wrong / dim highlight classes after the server reveals the answer.
   * @param {number}      correctIdx   Index of the correct option.
   * @param {number|null} selectedIdx  Index chosen by this player (null = unanswered).
   */
  applyRevealStyles(correctIdx, selectedIdx) {
    Utils.qs('.option-btn').forEach((b, i) => {
      b.disabled = true;
      if (i === correctIdx)       b.classList.add('correct');
      else if (i === selectedIdx) b.classList.add('wrong');
      else                        b.classList.add('dim');
    });
  }

  /**
   * Build a ranked leaderboard list inside the given container.
   * @param {object[]} lb           Array of { pid, name, score, streak }.
   * @param {string}   containerId  ID of the target element (no #).
   * @param {string}   myPid        Current player's ID (highlighted).
   */
  renderLeaderboard(lb, containerId, myPid) {
    const medals = ['1st', '2nd', '3rd'];
    Utils.q('#' + containerId).innerHTML = lb.map((p, i) => `
      <div class="lb-item ${p.pid === myPid ? 'lb-me' : ''}">
        <div class="lb-rank ${['r1', 'r2', 'r3'][i] || ''}">${medals[i] || (i + 1) + 'th'}</div>
        <div class="lb-name">
          ${Utils.h(p.name)}
          ${p.pid === myPid ? '<span style="color:var(--muted);font-size:11px;"> (you)</span>' : ''}
        </div>
        ${p.streak > 1 ? `<div class="lb-streak">${p.streak}x</div>` : ''}
        <div class="lb-score">${p.score}</div>
      </div>
    `).join('');
  }

  /**
   * Render the player list in the lobby or during a game.
   * @param {object[]} players  Array of player objects.
   * @param {'lobby'|'game'} state  Current room state.
   * @param {string}   myPid   Current player's ID.
   * @param {string}   hostPid Current host player's ID.
   */
  renderPlayers(players, state, myPid, hostPid) {
    if (!players?.length) {
      Utils.q('#players-list').innerHTML =
        '<div style="font-size:13px;color:var(--muted);text-align:center;padding:20px 0;">Waiting for players...</div>';
      return;
    }

    Utils.q('#players-list').innerHTML = players.map(p => {
      const isYou = p.pid === myPid;
      const isHst = p.pid === hostPid;
      const isDc  = p.disconnected;
      const letter = (p.name || 'A')[0].toUpperCase();
      return `
        <div class="player-item ${isYou ? 'is-you' : ''} ${state !== 'lobby' && p.answered ? 'answered' : ''} ${isDc ? 'disconnected' : ''}">
          <div class="player-left">
            <div class="player-avatar" style="${isHst ? 'background:var(--accent);color:white;' : ''}${isDc ? 'opacity:0.4;' : ''}">${Utils.h(letter)}</div>
            <span${isDc ? ' style="opacity:0.4;text-decoration:line-through;"' : ''}>${Utils.h(p.name)}</span>
            ${isDc ? '<span style="font-size:10px;color:var(--muted);margin-left:4px;">disconnected</span>' : ''}
          </div>
          <div class="player-right">
            ${state !== 'lobby' ? `<div class="answered-dot ${p.answered ? '' : 'waiting'}"></div>` : ''}
            ${state !== 'lobby' ? `<div class="player-score">${p.score}</div>` : ''}
            ${isHst ? '<span class="badge badge-host">Host</span>' : ''}
            ${isYou && !isHst ? '<span class="badge badge-you">You</span>' : ''}
          </div>
        </div>
      `;
    }).join('');

    const count = players.length;
    Utils.q('#player-count').textContent = count + ' player' + (count !== 1 ? 's' : '');
  }

  /**
   * Render everyone's open answers during reveal.
   * @param {object[]} results  Array of { name, openAnswer, correct, pid }.
   * @param {string}   myPid   Current player's ID.
   */
  renderOpenAnswers(results, myPid) {
    const container = Utils.q('#rv-open-answers');
    const list      = Utils.q('#rv-open-answers-list');

    const withAnswers = results.filter(r => r.openAnswer);

    if (!withAnswers.length) {
      container.classList.add('hidden');
      return;
    }

    container.classList.remove('hidden');
    list.innerHTML = withAnswers.map(r => `
      <div class="lb-item ${r.pid === myPid ? 'lb-me' : ''}">
        <div class="lb-name">
          ${Utils.h(r.name)}
          ${r.pid === myPid ? '<span style="color:var(--muted);font-size:11px;"> (you)</span>' : ''}
        </div>
        <div style="flex:1;padding:0 8px;font-size:14px;color:var(--muted);">
          ${Utils.h(r.openAnswer || '—')}
        </div>
        <div style="font-weight:700;color:${r.correct ? 'var(--green)' : '#dc2626'};">
          ${r.correct ? '✓' : '✗'}
        </div>
      </div>
    `).join('');
  }
}
