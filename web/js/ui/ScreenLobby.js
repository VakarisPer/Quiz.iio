'use strict';

class ScreenLobby {
  static get html() {
    return `
      <div class="screen" id="screen-lobby">
        <div class="topbar">
          <div class="logo">Quiz<em style="color:var(--accent)">za</em></div>
          <button type="button" class="btn btn-ghost btn-sm" onclick="App.lobby.leaveRoom()">Leave Room</button>
        </div>

        <!-- Room code -->
        <div class="card">
          <div class="section-label" style="text-align:center;">Room Code — Share with friends</div>
          <div class="room-code-big" id="lobby-code" onclick="App.lobby.copyCode()">-----</div>
          <p class="code-copy-hint">Click to copy</p>
          <div class="notice notice-info hidden mt12" id="lobby-notice"></div>
        </div>

        <!-- Players -->
        <div class="card">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
            <div class="card-title" style="margin:0;">Players</div>
            <div id="player-count" style="font-size:18px;font-weight:800;color:var(--muted);">0</div>
          </div>
          <div class="players-list" id="players-list">
            <div style="font-size:13px;color:var(--muted);text-align:center;padding:20px 0;">
              Waiting for players…
            </div>
          </div>
        </div>

        <!-- HOST ONLY: settings + start -->
        <div id="host-panel" style="display:none;">
          <div class="card">
            <div class="card-title">Game Settings</div>

            <div class="field">
              <div class="range-row">
                <label style="margin:0;">Questions per game</label>
                <div>
                  <span class="range-val" id="v-questions">10</span>
                  <span class="range-unit"> questions</span>
                </div>
              </div>
              <input type="range" id="r-questions" min="5" max="20" value="10" step="1"
                oninput="document.getElementById('v-questions').textContent = this.value">
              <div class="range-hint"><span>5</span><span>20</span></div>
            </div>

            <div class="field">
              <div class="range-row">
                <label style="margin:0;">Seconds per question</label>
                <div>
                  <span class="range-val" id="v-timer">35</span>
                  <span class="range-unit"> sec</span>
                </div>
              </div>
              <input type="range" id="r-timer" min="10" max="60" value="35" step="5"
                oninput="document.getElementById('v-timer').textContent = this.value">
              <div class="range-hint"><span>10s</span><span>60s</span></div>
            </div>

            <div class="field">
              <label>Max Players</label>
              <select id="s-maxplayers" onchange="App.lobby.updateSettings()">
                <option value="0">Unlimited</option>
                <option value="4">4 players</option>
                <option value="8">8 players</option>
                <option value="12">12 players</option>
                <option value="16">16 players</option>
              </select>
            </div>

            <div class="field">
              <label>Difficulty</label>
              <select id="s-difficulty" onchange="App.lobby.updateSettings()">
                <option value="normal">Normal</option>
                <option value="easy">Easy</option>
                <option value="hard">Hard</option>
              </select>
            </div>

            <div class="field">
              <label>Language</label>
              <select id="s-language" onchange="App.lobby.updateSettings()">
                <option value="english">English</option>
                <option value="lithuanian">Lietuvių</option>
                <option value="spanish">Español</option>
                <option value="french">Français</option>
                <option value="german">Deutsch</option>
                <option value="polish">Polski</option>
                <option value="other">Other</option>
              </select>
              <input type="text" id="s-language-custom" placeholder="Type your language..." 
                class="hidden" onchange="App.lobby.updateSettings()" style="margin-top:8px; display: none;">
            </div>
          </div>

          <div class="card">
            <div class="card-title">AI Question Source</div>
            <p style="font-size:13px;color:var(--muted);margin-bottom:16px;line-height:1.6;">
              Optional — Upload a file and add specific instructions. The AI will generate quiz questions from your content.
            </p>

            <div class="field">
              <label>Upload File (.pdf .docx .pptx .txt)</label>
              <div class="upload-zone" id="upload-zone"
                ondragover="event.preventDefault(); this.classList.add('drag-over')"
                ondragleave="this.classList.remove('drag-over')" ondrop="App.lobby.handleDrop(event)">
                <input type="file" accept=".txt,.pdf,.docx,.pptx" id="file-input"
                  onchange="App.lobby.handleFileSelect(event)">
                <div class="upload-icon">↑</div>
                <p id="upload-zone-hint">Drop a file here or click to browse (standard file limit)</p>
                <div class="upload-file-name hidden" id="file-label"></div>
              </div>
              <p id="file-size-hint" style="font-size:12px;color:var(--muted);margin-top:8px;">
                The kb/mb size shown in green represents the character count of the uploaded file. NOT IMAGES. yet
              </p>
            </div>

            <div class="field">
              <label>Specific instructions</label>
              <textarea id="ctx-text"
                placeholder="e.g. Focus on key terms only, make questions challenging, avoid true/false…"></textarea>
            </div>

            <div class="notice notice-ok hidden mt12" id="ctx-saved-notice">
              AI source saved. Questions will be generated from your content.
            </div>
          </div>

          <button type="button" class="btn btn-primary btn-full btn-lg" id="start-btn" onclick="App.lobby.startGame()">
            Start Game
          </button>
          <p style="text-align:center;font-size:12px;color:var(--muted);margin-top:10px;">
            Only you (the host) can start the game
          </p>
        </div>

        <!-- PLAYER ONLY: waiting notice -->
        <div id="player-wait" style="display:none;">
          <div class="notice notice-info">
            Waiting for the host to start the game…
          </div>
        </div>
      </div>`;
  }
}
