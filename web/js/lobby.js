'use strict';

/**
 * LobbyController — handles everything on the Home and Lobby screens:
 * creating/joining rooms, settings, file upload, and the room code.
 */
class LobbyController {
  constructor() {
    this._roomCode    = null;
    this._fileContext = '';  // extracted text from uploaded file
    this._language    = 'english';  // AI question generation language
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
    App.state.isHost = false;
    App.state.myPid  = null;
    App.state.myName = '';
    App.screens.show('screen-home');
  }

  // ── AI source ─────────────────────────────────────────────

  /** Send the file content + specific instructions to the server. */
  saveContext() {
    const instructions = Utils.q('#ctx-text').value.trim();
    if (!this._fileContext && !instructions) return;
    console.log('[DEBUG] AI context language:', this._language);
    const context = [this._fileContext, instructions].filter(Boolean).join('\n\n---\nInstructions: ');
    App.conn.send({ type: 'set_context', context, language: this._language });
    Utils.q('#ctx-saved-notice').classList.remove('hidden');
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

  /** Toggle visibility of custom language input field. */
  // toggleCustomLanguage() 
  // {
  //   const select = Utils.q('#s-language');
  //   const customInput = Utils.q('#s-language-custom');

  //   if (select.value === 'Other') {
  //     customInput.classList.remove('hidden');
  //     customInput.focus();
  //   } else {
  //     customInput.classList.add('hidden');
  //     this.updateSettings();
  //   }
  // }

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
    const isServer = ['.pdf','.docx', '.pptx'].some(ext => name.endsWith(ext));

    if (!isTxt && !isServer) {
      App.toast.show('Supported: PDF, Word (.docx), PPTX, TXT', 'err');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      App.toast.show('File too large (max 50 MB)', 'err');
      return;
    }

    if (isTxt) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target.result;
        if (text === null || text === undefined) {
          App.toast.show('Failed to read text file', 'err');
          console.error('[DEBUG] Failed to extract text from:', file.name);
          return;
        }
        this._fileContext = text
        
        // DEBUG: Log extracted text and save to localStorage for debugging
        console.log('[DEBUG] Extracted text from file:', file.name);
        console.log('[DEBUG] Text length:', text.length, 'bytes');
        console.log('[DEBUG] First 200 chars:', text.substring(0, 200));
        // Save to localStorage for debugging (browser storage)
        try {
          const debugKey = `debug_upload_${Date.now()}_${file.name}`;
          localStorage.setItem(debugKey, text);
          console.log('[DEBUG] Saved to localStorage with key:', debugKey);
        } catch (e) {
          console.warn('[DEBUG] Could not save to localStorage:', e.message);
        }
        
        const lbl = Utils.q('#file-label');
        lbl.textContent = `Loaded: ${file.name} (${Math.round(text.length / 1024 * 10) / 10} KB)`;
        lbl.classList.remove('hidden');
        App.toast.show('File loaded: ' + file.name, 'ok');
      };
      reader.onerror = () => {
        App.toast.show('Failed to read file', 'err');
        console.error('[DEBUG] FileReader error for:', file.name);
      };
      reader.readAsText(file);
    } 
    else 
    {
      // pdf / DOCX / PPTX — send to server for extraction
      const lbl = Utils.q('#file-label');
      lbl.textContent = 'Extracting ' + file.name + '…';
      lbl.classList.remove('hidden');

      const reader = new FileReader();
      reader.onload = (ev) => {
        const arrayBuffer = ev.target.result;
        if (!arrayBuffer) {
          App.toast.show('Failed to read file', 'err');
          lbl.classList.add('hidden');
          return;
        }
        const bytes  = new Uint8Array(arrayBuffer);
        let binary   = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        App.conn.send({ type: 'upload_file', name: file.name, data: btoa(binary) });
      };
      reader.onerror = () => {
        App.toast.show('Failed to read file', 'err');
        lbl.classList.add('hidden');
      };
      reader.readAsArrayBuffer(file);
    }
  }

  /** Store server-extracted file text (shown in upload zone, not in instructions textarea). */
  handleFileText(m) {
    this._fileContext = m.text;
    
    // DEBUG: Log extracted text from server-processed files (PDF/DOCX/PPTX)
    console.log('[DEBUG] Received extracted text from server for:', m.name);
    console.log('[DEBUG] Text length:', m.text.length, 'bytes');
    console.log('[DEBUG] First 200 chars:', m.text.substring(0, 200));
    // Save to localStorage for debugging (browser storage)
    try {
      const debugKey = `debug_extracted_${Date.now()}_${m.name}`;
      localStorage.setItem(debugKey, m.text);
      console.log('[DEBUG] Saved extracted text to localStorage with key:', debugKey);
    } catch (e) {
      console.warn('[DEBUG] Could not save to localStorage:', e.message);
    }
    
    const lbl = Utils.q('#file-label');
    lbl.textContent = `Extracted: ${m.name} (${Math.round(m.text.length / 1024 * 10) / 10} KB)`;
    lbl.classList.remove('hidden');
    App.toast.show('Extracted: ' + m.name, 'ok');
    this.saveContext();
  }

}
