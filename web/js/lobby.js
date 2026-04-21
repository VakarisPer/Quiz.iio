'use strict';

/**
 * LobbyController — handles everything on the Home and Lobby screens:
 * creating/joining rooms, settings, file upload, and the room code.
 */
class LobbyController {
  constructor() {
    this._roomCode    = null;
    this._language    = 'english';  // AI question generation language
    this._uploadedFiles = [];       // { name, text } for each uploaded file
  }

  /** The current room code (null before a room is created/joined). */
  get roomCode() { return this._roomCode; }

  // ── Tab switching ─────────────────────────────────────────

  /** Toggle between "Create Room" and "Join Room" panels. */
  setTab(t) {
    Utils.q('#panel-create').style.display = t === 'create' ? '' : 'none';
    Utils.q('#panel-join').style.display   = t === 'join'   ? '' : 'none';
    Utils.q('#tab-create').classList.toggle('active', t === 'create');
    Utils.q('#tab-join').classList.toggle('active',   t === 'join');
  }

  // ── Room actions ──────────────────────────────────────────

  /** Validate name and ask the server to create a new room. */
  createRoom() {
    const name = Utils.q('#c-name').value.trim();
    if (!name) { App.toast.show('Please enter your name', 'err'); return; }
    App.state.myName = name;
    App.state.isHost = true;
    const isPrivate = Utils.q('#c-private')?.checked || false;
    App.conn.send({ type: 'create_room', name, private: isPrivate });
  }

  /** Validate name + code and ask the server to join. */
  joinRoom() {
    const name = Utils.q('#j-name').value.trim();
    const code = Utils.q('#j-code').value.trim().toUpperCase();
    if (!name) { App.toast.show('Please enter your name', 'err'); return; }
    if (code.length < 4) { App.toast.show('Enter the 5-letter room code', 'err'); return; }
    App.state.myName = name;
    App.state.isHost = false;
    App.conn.send({ type: 'join_room', name, code });
  }

  /** Copy the room code to the clipboard. */
  copyCode() {
    if (!this._roomCode) return;
    navigator.clipboard.writeText(this._roomCode)
      .then(() => App.toast.show('Room code copied!', 'ok'));
  }

  /** Store and display the room code received from the server. */
  setCode(code) {
    this._roomCode = code;
    Utils.q('#lobby-code').textContent = code;
  }

  /** Leave the room and return to the home screen. */
  leaveRoom() {
    App.conn.send({ type: 'leave_room' });
    this._roomCode   = null;
    App.state.clearAll();
    App.screens.show('screen-home');
  }

  // ── AI source ─────────────────────────────────────────────

  /** Send the instructions + file content as AI context to the server. */
  saveContext() {
    const instructions = Utils.q('#ctx-text').value.trim();
    const fileContent = this._uploadedFiles.map(f => f.text).join('\n\n');
    const parts = [];
    if (fileContent)   parts.push(fileContent);
    if (instructions)  parts.push('Instructions: ' + instructions);
    const context = parts.join('\n\n');
    if (!context) return;
    App.conn.send({ type: 'set_context', context, language: this._language });
    Utils.q('#ctx-saved-notice').classList.remove('hidden');
  }

  /** Handle a drag-and-drop file onto the upload zone. */
  handleDrop(e) {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) this._loadFile(file);
  }

  /** Handle a file chosen through the file input element. */
  handleFileSelect(e) {
    const file = e.target?.files?.[0];
    if (file) this._loadFile(file);
  }


  /** Send updated room settings (max players, difficulty, language) to the server. */
  updateSettings() 
  {
    const maxPlayers = parseInt(Utils.q('#s-maxplayers')?.value || '0');
    const difficulty = Utils.q('#s-difficulty')?.value || 'normal';

    const select = Utils.q('#s-language');
    let language = select.value || 'english';

    const input = Utils.q('#s-language-custom');

    // hide by default
    input.style.display = 'none';

    if (language === 'other') 
    {
      input.style.display = '';

      const value = input.value.trim();
      if (!value) 
      {
        App.toast.show('Please enter a language', 'err');
        return;
      }

      language = value;
    }

    this._language = language;
    App.conn.send({ type: 'update_settings', maxPlayers, difficulty, language });
  }

  /** Ask the server to start the game with the configured settings. */
  startGame() {
    this.saveContext();
    const questions = parseInt(Utils.q('#r-questions').value);
    const timer     = parseInt(Utils.q('#r-timer').value);
    App.conn.send({ 
      type: 'start_game', 
      questions, 
      timer,
      questionMode: this._questionMode || 'multiple', // ← add this
    });
  }

  // ── Panel visibility ──────────────────────────────────────

  /** Show host controls (settings, start button). */
  showAsHost() {
    Utils.q('#host-panel').style.display  = '';
    Utils.q('#player-wait').style.display = 'none';
  }

  /** Show the "waiting for host" notice for non-host players. */
  showAsPlayer() {
    Utils.q('#host-panel').style.display  = 'none';
    Utils.q('#player-wait').style.display = '';
  }

  /** Reset lobby UI after a "play again" / lobby reset event. */
  reset() {
    Utils.q('#lobby-code').textContent = this._roomCode || '—';
    if (App.state.isHost) this.showAsHost();
    else                   this.showAsPlayer();
    Utils.setNotice('lobby-notice', '', '');
    App.screens.show('screen-lobby');
  }

  // ── Private ───────────────────────────────────────────────

  _loadFile(file) {
    const nameEl = Utils.q('#fileName');
    nameEl.textContent = `Uploading ${file.name}…`;

    const form = new FormData();
    form.append('file', file);

    fetch('/api/upload', { method: 'POST', body: form })
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data.error || 'Upload failed');

        this._uploadedFiles.push({ name: file.name, text: data.text });
        this._renderFileList();
        this._updateFileContentPreview();
        nameEl.textContent = '';
        App.toast.show('File loaded: ' + file.name, 'ok');
      })
      .catch(err => {
        nameEl.textContent = `✗ ${err.message}`;
        App.toast.show(err.message, 'err');
      });

    // Reset input so the same file can be re-selected
    const input = Utils.q('#fileInput');
    if (input) input.value = '';
  }

  /** Remove a file from the uploaded list by index. */
  removeFile(index) {
    this._uploadedFiles.splice(index, 1);
    this._renderFileList();
    this._updateFileContentPreview();
  }

  /** Render the list of uploaded files with delete buttons. */
  _renderFileList() {
    const container = Utils.q('#file-list');
    if (!container) return;

    if (this._uploadedFiles.length === 0) {
      container.innerHTML = '';
      Utils.q('#file-content-preview')?.classList.add('hidden');
      return;
    }

    Utils.q('#file-content-preview')?.classList.remove('hidden');

    container.innerHTML = this._uploadedFiles.map((f, i) =>
      `<div class="file-chip">
        <span class="file-chip-name">${Utils.h(f.name)}</span>
        <button type="button" class="file-chip-remove" onclick="App.lobby.removeFile(${i})" title="Remove file">&times;</button>
      </div>`
    ).join('');
  }

  /** Update the hidden file content preview textarea. */
  _updateFileContentPreview() {
    const textarea = Utils.q('#ctx-file-content');
    if (textarea) {
      textarea.value = this._uploadedFiles.map(f => `--- ${f.name} ---\n${f.text}`).join('\n\n');
    }
  }

  /** Clear the instructions textarea. */
  clearInstructions() {
    Utils.q('#ctx-text').value = '';
  }

  setQuestionMode(mode) {
    this._questionMode = mode;

    // Update button styles
    Utils.q('#mode-multiple').className = mode === 'multiple'
      ? 'btn btn-primary btn-sm'
      : 'btn btn-ghost btn-sm';
    Utils.q('#mode-open').className = mode === 'open'
      ? 'btn btn-primary btn-sm'
      : 'btn btn-ghost btn-sm';

    App.conn.send({ type: 'set_question_mode', mode });
  }

}
