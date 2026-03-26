'use strict';

class ScreenHome {
  static get html() {
    return `
      <div class="screen active" id="screen-home">
        <div style="text-align:center; padding-top:36px; margin-bottom:20px;">
          <div class="logo">QUIZ<em>ZA</em></div>
          <div class="tagline">Real-time multiplayer quiz game</div>
        </div>
        
        <!-- Banner ad (home screen only) -->
        <div class="ad-banner-strip"></div>

        <div class="card">
          <div class="tabs">
            <button type="button" class="tab-btn active" id="tab-create" onclick="App.lobby.setTab('create')">Create Room</button>
            <button type="button" class="tab-btn" id="tab-join" onclick="App.lobby.setTab('join')">Join Room</button>
          </div>

          <!-- Create panel -->
          <div id="panel-create">
            <div class="field">
              <label for="c-name">Your Name</label>
              <input type="text" id="c-name" placeholder="Enter your name…" maxlength="20" autocomplete="off" spellcheck="false">
            </div>
            <div class="field mt12">
              <div class="visibility-row">
                <div>
                  <div class="visibility-label">Private Room</div>
                  <div class="visibility-hint">Hide from live rooms list</div>
                </div>
                <label class="toggle-switch">
                  <input type="checkbox" id="c-private">
                  <span class="toggle-knob"></span>
                </label>
              </div>
            </div>
            <button type="button" class="btn btn-primary btn-full btn-lg mt8" onclick="App.lobby.createRoom()">
              Create Game Room
            </button>
            <p style="text-align:center;font-size:12px;color:var(--muted);margin-top:10px;">
              You'll get a room code to share with friends
            </p>
          </div>

          <!-- Join panel -->
          <div id="panel-join" style="display:none;">
            <div class="field">
              <label for="j-name">Your Name</label>
              <input type="text" id="j-name" placeholder="Enter your name…" maxlength="20" autocomplete="off" spellcheck="false">
            </div>
            <div class="field mt12">
              <label for="j-code">Room Code</label>
              <input type="text" id="j-code" class="code-input" placeholder="XXXXX" maxlength="5" autocomplete="off" spellcheck="false" pattern="[A-Za-z0-9]{5}" inputmode="text">
            </div>
            <button type="button" class="btn btn-primary btn-full btn-lg mt8" onclick="App.lobby.joinRoom()">
              Join Game
            </button>
          </div>
        </div>

        <!-- Live Rooms Feed -->
        <div class="live-box">
          <div class="live-header">
            <div class="live-header-left">
              <div class="live-dot"></div>
              <span class="live-title">Live Rooms</span>
            </div>
            <span class="live-count" id="live-count">0 active</span>
          </div>
          <div class="live-scroll" id="live-list">
            <div class="live-empty">No active rooms yet&hellip;</div>
          </div>
        </div>

        <!-- Creators -->
        <div class="creators-wrap">
          <div class="creator-card">
            <div class="creator-avatar">VP</div>
            <div class="creator-info">
              <div class="creator-name">Vakaris Perliba</div>
              <div class="creator-role">Co-creator &amp; Developer</div>
            </div>
          </div>
          <div class="creator-card">
            <div class="creator-avatar">VN</div>
            <div class="creator-info">
              <div class="creator-name">Vitas Novickas</div>
              <div class="creator-role">Co-creator &amp; Developer</div>
            </div>
          </div>
        </div>

        <!-- Donation Box -->
        <div class="donation-box">
          <div class="donation-title">☕ Support Quizza</div>
          <div class="donation-desc">
            We're two broke students — every coffee goes directly to server & AI API costs to keep the game free 🙏
          </div>
          <a 
            href="https://ko-fi.com/quizza" 
            target="_blank" 
            rel="noopener noreferrer"
            class="btn btn-donate"
          >
            ☕ Buy us a coffee
          </a>
        </div>

        <div class="conn-status">
          <div class="conn-dot pending" id="conn-dot"></div>
          <span id="conn-text">Connecting to server…</span>
          <span id="active-players-text" style="margin-left:14px;color:var(--muted);font-size:13px;"></span>
        </div>
        <hr class="divider" style="margin:24px 0 0;">
        <div style="text-align:center;padding:16px 0 8px;font-size:13px;color:var(--muted);">
          <a href="privacy.html" style="color:var(--muted);text-decoration:underline;">Privacy Policy</a>
          &nbsp;·&nbsp;
          <a href="terms.html" style="color:var(--muted);text-decoration:underline;">Terms of Service</a>
          &nbsp;·&nbsp;
          <a href="mailto:contact@quizza.gg" style="color:var(--muted);text-decoration:underline;">Contact</a>
        </div>
      </div>`;
  }
}
