'use strict';

/**
 * LobbyController — handles everything on the Home and Lobby screens:
 * creating/joining rooms, settings, file upload, and the room code.
 */
class LobbyController {
  constructor() {
    this._roomCode    = null;
    this._fileContext = '';  // extracted text from uploaded file
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
    App.conn.send({ type: 'create_room', name });
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
    App.state.isHost = false;
    App.state.myPid  = null;
    App.state.myName = '';
    App.screens.show('screen-home');
  }

  // ── AI source ─────────────────────────────────────────────

  /** Send the file content + specific instructions to the server. */
  saveContext() {
    const instructions = Utils.q('#ctx-text').value.trim();
    if (!this._fileContext && !instructions) {
      App.toast.show('Upload a file or add instructions first', 'err');
      return;
    }
    const context = [this._fileContext, instructions].filter(Boolean).join('\n\n---\nInstructions: ');
    App.conn.send({ type: 'set_context', context });
    Utils.q('#ctx-saved-notice').classList.remove('hidden');
    App.toast.show('AI source saved!', 'ok');
  }

  /** Handle a drag-and-drop file onto the upload zone. */
  handleDrop(e) {
    e.preventDefault();
    Utils.q('#upload-zone').classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (file) this._loadFile(file);
  }

  /** Handle a file chosen through the file input element. */
  handleFileSelect(e) {
    const file = e.target?.files?.[0];
    if (file) this._loadFile(file);
  }

  // ── Game settings ─────────────────────────────────────────

  /** Ask the server to start the game with the configured settings. */
  startGame() {
    const questions = parseInt(Utils.q('#r-questions').value);
    const timer     = parseInt(Utils.q('#r-timer').value);
    App.conn.send({ type: 'start_game', questions, timer });
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
    const name   = file.name.toLowerCase();
    const isTxt  = name.endsWith('.txt');
    const isServer = ['.pdf', '.docx', '.pptx'].some(ext => name.endsWith(ext));

    if (!isTxt && !isServer) {
      App.toast.show('Supported: PDF, Word (.docx), PPTX, TXT', 'err');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      App.toast.show('File too large (max 5 MB)', 'err');
      return;
    }

    if (isTxt) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target.result;
        this._fileContext = text;
        const lbl = Utils.q('#file-label');
        lbl.textContent = `Loaded: ${file.name} (${Math.round(text.length / 1024 * 10) / 10} KB)`;
        lbl.classList.remove('hidden');
        App.toast.show('File loaded: ' + file.name, 'ok');
      };
      reader.readAsText(file);
    } else {
      // PDF / DOCX / PPTX — send to server for extraction
      const lbl = Utils.q('#file-label');
      lbl.textContent = 'Extracting ' + file.name + '…';
      lbl.classList.remove('hidden');

      const reader = new FileReader();
      reader.onload = (ev) => {
        const bytes  = new Uint8Array(ev.target.result);
        let binary   = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        App.conn.send({ type: 'upload_file', name: file.name, data: btoa(binary) });
      };
      reader.readAsArrayBuffer(file);
    }
  }

  /** Store server-extracted file text (shown in upload zone, not in instructions textarea). */
  handleFileText(m) {
    this._fileContext = m.text;
    const lbl = Utils.q('#file-label');
    lbl.textContent = `Extracted: ${m.name} (${Math.round(m.text.length / 1024 * 10) / 10} KB)`;
    lbl.classList.remove('hidden');
    App.toast.show('Extracted: ' + m.name, 'ok');
  }
}
