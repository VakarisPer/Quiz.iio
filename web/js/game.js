'use strict';

/**
 * GameController — manages the active gameplay loop:
 * showing questions, accepting answers, revealing results,
 * and displaying the final scoreboard.
 */
class GameController {
  constructor() {
    /** Index of the answer chosen by this player, or null. */
    this.curAnswer  = null;

    /** Human-readable question number (1-based). */
    this.curQNum    = 0;

    /** Total questions in this game. */
    this.totalQs    = 10;

    /** Time allowed per question in seconds. */
    this.qDuration  = 35;

    /**
     * Last `answer_result` message received from the server.
     * Populated asynchronously; read during showReveal().
     * @type {object|null}
     */
    this.lastResult = null;

    this._revealInterval = null;
  }

  // ── Question ──────────────────────────────────────────────

  /**
   * Transition to the question screen and start the timer.
   * @param {object} m  Server `question` message payload.
   */   
  showQuestion(m) {
    this.curAnswer  = null;
    this.lastResult = null;
    this.curQNum    = m.index + 1;
    this.stopRevealCountdown();
    this.totalQs    = m.total;
    this.qDuration  = m.duration;
    this._questionMode = m.mode || 'multiple';

    Utils.q('#g-qnum').textContent     = this.curQNum;
    Utils.q('#g-qtotal').textContent   = this.totalQs;
    Utils.q('#g-topic').textContent    = m.topic || 'General';
    Utils.q('#g-question').innerHTML   = Utils.h(m.question);
    Utils.q('#g-answered').textContent = '';

    if (this._questionMode === 'open') {
      console.log('[DEBUG] switching to open mode UI');
      // Show open answer input, hide options
      Utils.q('#g-options').style.display      = 'none';
      Utils.q('#g-open-answer').style.display  = '';
      Utils.q('#open-answer-input').value      = '';
      Utils.q('#open-answer-input').disabled   = false;
      Utils.q('#g-open-answer').querySelector('button').disabled = false;
    } else {
      // Show options, hide open answer input
      Utils.q('#g-options').style.display      = '';
      Utils.q('#g-open-answer').style.display  = 'none';
      App.renderer.renderOptions(m.options);
    }
    App.timer.start(m.duration);
    App.screens.show('screen-game');

    // Re-typeset MathJax for question + options
    if (window.MathJax?.typesetPromise) {
      MathJax.typesetPromise([Utils.q('#g-question'), Utils.q('#g-options')]).catch(() => {});
    }
    
  }

  // ── Answer selection ──────────────────────────────────────

  /**
   * Record the player's choice, update the UI, and send to server.
   * Does nothing if an answer was already submitted.
   * @param {number} idx  0-based option index.
   */
  pickAnswer(idx) {
    if (this.curAnswer !== null) return;
    this.curAnswer = idx;

    Utils.qs('.option-btn').forEach((b, i) => {
      if (i === idx) b.classList.add('selected');
      b.disabled = true;
    });

    App.conn.send({ type: 'answer', index: idx });
  }

  submitOpenAnswer() {
    if (this.curAnswer !== null) return; // already submitted

    const input = Utils.q('#open-answer-input');
    const answer = input.value.trim();

    if (!answer) {
      App.toast.show('Please type an answer first', 'err');
      return;
    }

    this.curAnswer = answer;

    // Disable input and button so they can't resubmit
    input.disabled = true;
    Utils.q('#g-open-answer').querySelector('button').disabled = true;

    App.conn.send({ type: 'open_answer', answer });
    App.toast.show('Answer submitted!', 'ok');
  }

  /**
   * Update the "X of Y answered" status line during a question.
   * @param {number} answeredCount
   * @param {number} total
   */
  updateAnsweredCount(answeredCount, total) {
    Utils.q('#g-answered').innerHTML =
      `<strong>${answeredCount}</strong> of ${total} answered`;
  }

  // ── Reveal ────────────────────────────────────────────────

  /**
   * Transition to the reveal screen showing the answer and leaderboard.
   * @param {object} m  Server `reveal` message payload.
   */
  showReveal(m) {
    App.timer.stop();

    Utils.q('#rv-qnum').textContent   = this.curQNum;
    Utils.q('#rv-qtotal').textContent = this.totalQs;

    this._renderVerdictSection();
    this._renderExplanation(m.explanation);

    if (this._questionMode === 'open') {
      App.renderer.renderOpenAnswers(m.results, App.state.myPid);
    } else {
      Utils.q('#rv-open-answers').classList.add('hidden');
    }

    App.renderer.renderLeaderboard(m.leaderboard, 'rv-lb', App.state.myPid);

    // Reset skip-vote button (all players must vote to skip)
    const skipBtn = Utils.q('#rv-skip-btn');
    const needed  = m.leaderboard.length;
    skipBtn.textContent = 'Skip (0/' + needed + ')';
    skipBtn.disabled    = false;

    this._startRevealCountdown();
    App.screens.show('screen-reveal');
  }

  // ── Results ───────────────────────────────────────────────

  /**
   * Transition to the final results / winner screen.
   * @param {object} m  Server `game_over` message payload.
   */
  showResults(m) {
    App.timer.stop();
    this.stopRevealCountdown();

    const winner = m.winner;
    Utils.q('#res-winner').textContent     = winner ? winner.name        : 'No winner';
    Utils.q('#res-winner-pts').textContent = winner ? winner.score + ' points' : '';

    App.renderer.renderLeaderboard(m.leaderboard, 'res-lb', App.state.myPid);
    this._renderResultActions();
    App.screens.show('screen-results');
  }

  /** Ask the server to reset to the lobby for another round (host only). */
  playAgain() {
    App.conn.send({ type: 'play_again' });
  }

  /** Send a skip vote to the server (player can only vote once per reveal). */
  voteSkip() {
    const btn = Utils.q('#rv-skip-btn');
    if (btn) btn.disabled = true;
    App.conn.send({ type: 'vote_skip' });
  }

  /** Update the skip button label with current vote counts. */
  updateSkipVotes(count, needed) {
    const btn = Utils.q('#rv-skip-btn');
    if (btn) btn.textContent = 'Skip (' + count + '/' + needed + ')';
  }

  /** Stop the reveal next-question countdown. */
  stopRevealCountdown() {
    clearInterval(this._revealInterval);
  }

  // ── Private ───────────────────────────────────────────────

  _renderVerdictSection() {
    const verdict  = Utils.q('#rv-verdict');
    const ptsEl    = Utils.q('#rv-pts');
    const totEl    = Utils.q('#rv-total');
    const streakEl = Utils.q('#rv-streak');

    if (this.lastResult) {
      const ok = this.lastResult.correct;
      verdict.textContent  = ok ? 'Correct!' : 'Wrong';
      verdict.className    = 'result-verdict ' + (ok ? 'v-correct' : 'v-wrong');
      ptsEl.textContent    = ok ? '+' + this.lastResult.points : '+0';
      ptsEl.style.color    = ok ? 'var(--green)' : '#dc2626';
      totEl.textContent    = this.lastResult.score;
      streakEl.textContent = this.lastResult.streak > 1
        ? this.lastResult.streak + 'x Streak!' : '';
    } else if (this._questionMode === 'open') {
      // For open questions, result may still be grading
      verdict.textContent  = 'Graded by AI';
      verdict.className    = 'result-verdict';
      ptsEl.textContent    = '…';
      totEl.textContent    = '…';
      streakEl.textContent = '';
    } else {
      verdict.textContent  = 'Time Up';
      verdict.className    = 'result-verdict v-wrong';
      ptsEl.textContent    = '+0';
      totEl.textContent    = '—';
      streakEl.textContent = '';
    }
  }

  _renderExplanation(text) {
    const expl = Utils.q('#rv-explanation');
    if (text) {
      expl.innerHTML = Utils.h(text);
      expl.classList.remove('hidden');
      if (window.MathJax?.typesetPromise) {
        MathJax.typesetPromise([expl]).catch(() => {});
      }
    } else {
      expl.classList.add('hidden');
    }
  }

  _startRevealCountdown() {
    let nxt = 10;
    const nxtEl = Utils.q('#rv-next');
    nxtEl.textContent = nxt;
    clearInterval(this._revealInterval);
    this._revealInterval = setInterval(() => {
      nxt--;
      nxtEl.textContent = Math.max(0, nxt);
      if (nxt <= 0) clearInterval(this._revealInterval);
    }, 1000);
  }

  _renderResultActions() {
    const actions = Utils.q('#res-actions');
    if (App.state.isHost) {
      actions.innerHTML = `
        <button class="btn btn-primary" onclick="App.game.playAgain()">Play Again</button>
        <button class="btn btn-ghost" onclick="App.lobby.leaveRoom()">Leave</button>
      `;
    } else {
      actions.innerHTML = `
        <button class="btn btn-secondary" onclick="App.screens.show('screen-lobby')">Back to Lobby</button>
        <button class="btn btn-ghost" onclick="App.lobby.leaveRoom()">Leave</button>
      `;
    }
  }
}
