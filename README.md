# Quizza

Real-time multiplayer quiz game with AI-powered question generation. A host creates a room, shares the code, players join, and the server runs a timed question-and-answer loop with live scoring.

The host can paste study notes or upload documents (`.txt`, `.md`, `.csv`, `.json`, `.pdf`, `.doc`, `.docx`, `.xlsx`, `.pptx`, `.html`, `.xml`) and the server calls the **DeepSeek API** to generate questions from that content. Supports **multiple-choice** and **open-ended** question modes, multiple difficulty levels, and six languages.

**Live at [quizza.online](https://www.quizza.online/)** — hosted on [Render](https://dashboard.render.com).

---

## Features

- **AI question generation** — DeepSeek API turns any study material into quiz questions with explanations
- **Two question modes** — Multiple choice (A/B/C/D) and open-ended (AI-graded free text)
- **Difficulty levels** — Easy, Normal, Hard
- **Multi-language** — English, Lithuanian, Spanish, French, German, Polish, or custom
- **File upload** — Drag-and-drop or file picker; documents converted via MarkItDown
- **User accounts** — Supabase auth (email/password registration, login, guest mode)
- **Live rooms feed** — See and join active public games in real time
- **Scoring** — Base points + time bonus + streak bonus with live leaderboard
- **Skip voting** — Players can vote to skip the current question
- **MathJax rendering** — LaTeX math expressions in questions, options, and explanations
- **Sound** — Background music with mute toggle (persisted in localStorage)
- **Keyboard shortcuts** — `Enter` to submit, `1`–`4` to pick answers
- **Security** — XSS sanitization, rate limiting (30 msg / 5 s), HTTP security headers
- **Responsive** — Mobile-friendly layout

---

## Project layout

```
Quizza/
├── server.js               # Entry point — wires and boots everything
├── package.json
├── .env                    # Environment variables (not committed)
│
├── src/                    # Server modules
│   ├── config.js           # Env vars and tunable constants
│   ├── logger.js           # Colour-coded, level-filtered logger
│   ├── utils.js            # makeCode(), makePid()
│   ├── player.js           # PlayerFactory.create()
│   ├── roomStore.js        # Shared rooms Map + pidToRoom Map
│   ├── roomHelpers.js      # broadcast, sendTo, leaderboard, snapshot, removePlayer
│   ├── questions.js        # QuestionService — DeepSeek AI generation + grading
│   ├── gameLoop.js         # startGame, runQuestion, revealAnswer, endGame
│   ├── messageHandler.js   # One handler per WebSocket message type
│   ├── httpServer.js       # Express server — static files + API routes
│   └── wsServer.js         # WebSocket connection lifecycle + rate limiting
│
├── web/                    # Client (static files served by Express)
│   ├── index.html          # All screens and HTML markup
│   ├── style.css           # Main stylesheet (imports from css/)
│   ├── css/                # Modular stylesheets
│   │   ├── base.css        # Reset, variables, typography
│   │   ├── layout.css      # Grid, containers, responsive
│   │   ├── components.css  # Buttons, inputs, cards
│   │   ├── auth.css        # Login/register screens
│   │   ├── home.css        # Home screen, live rooms
│   │   ├── lobby.css       # Lobby settings, player list
│   │   └── game.css        # Game, reveal, results screens
│   ├── js/
│   │   ├── app.js          # App namespace + boot
│   │   ├── state.js        # Shared mutable state (pid, name, isHost)
│   │   ├── connection.js   # WebSocket lifecycle + auto-reconnect
│   │   ├── messages.js     # Routes incoming server messages
│   │   ├── screens.js      # ScreenManager — shows/hides screens
│   │   ├── lobby.js        # LobbyController — create/join/settings/upload
│   │   ├── game.js         # GameController — question/reveal/results
│   │   ├── renderer.js     # GameRenderer — options, leaderboard, player list
│   │   ├── timer.js        # TimerManager — SVG ring countdown
│   │   ├── countdown.js    # CountdownOverlay — full-screen 3-2-1
│   │   ├── liveRooms.js    # Live rooms feed on home screen
│   │   ├── keyboard.js     # Enter + 1-4 hotkeys
│   │   ├── sound.js        # Background music + mute toggle
│   │   ├── supabase.js     # Supabase auth client
│   │   ├── layout.js       # Responsive layout helpers
│   │   ├── templates.js    # HTML template functions
│   │   ├── toast.js        # Toast notification popups
│   │   └── utils.js        # DOM helpers: q(), qs(), h()
│   │   └── ui/             # Screen-specific UI modules
│   │       ├── ScreenRegLog.js
│   │       ├── ScreenHome.js
│   │       ├── ScreenLobby.js
│   │       ├── ScreenGame.js
│   │       ├── ScreenReveal.js
│   │       ├── ScreenResults.js
│   │       └── ScreenAccount.js
│   └── sounds/
│       └── default.mp3
│
└── uploads/                # Temporary file uploads (auto-cleaned)
```

---

## Requirements

- **Node.js** 18 or later (`fetch` is required for AI requests)
- **npm**

---

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/your-username/Quizza.git
cd Quizza
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create `.env`

```env
PORT=3000
DEEPSEEK_API_KEY=your_key_here
LOG_LEVEL=INFO
SUPABASE_URL=https://your-project.supabase.co/
SUPABASE_KEY_PUBLIC=your_public_key
SUPABASE_KEY_PRIVATE=your_service_role_key
MATHPIX_APP_ID=your_app_id
MATHPIX_APP_KEY=your_app_key
```

All variables are optional. Without `DEEPSEEK_API_KEY` the AI features are disabled. Without Supabase keys, auth is unavailable (guest-only). Without Mathpix, PDF extraction falls back to plain text.

### 4. Start the server

```bash
node server.js
```

Open `http://localhost:3000` in your browser.

For development with auto-restart:

```bash
npm run dev
```

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | TCP port the server listens on |
| `DEEPSEEK_API_KEY` | *(empty)* | DeepSeek API key for AI question generation |
| `LOG_LEVEL` | `INFO` | Verbosity: `DEBUG`, `INFO`, `WARN`, or `ERROR` |
| `SUPABASE_URL` | *(empty)* | Supabase project URL for user authentication |
| `SUPABASE_KEY_PUBLIC` | *(empty)* | Supabase publishable (anon) key |
| `SUPABASE_KEY_PRIVATE` | *(empty)* | Supabase service role key |
| `MATHPIX_APP_ID` | *(empty)* | Mathpix OCR app ID for formula-aware PDF extraction |
| `MATHPIX_APP_KEY` | *(empty)* | Mathpix OCR app key |

---

## How a game works

```
Host creates room       ──►  Room gets a 5-char code
Players join            ──►  Code shared or joined via live rooms feed
Host configures         ──►  Questions (1–50), timer (5–120 s), difficulty, language, mode
Host uploads content    ──►  Optional: paste text or upload a document
Host clicks Start       ──►  3-second countdown broadcasts to everyone
                        ──►  Server generates questions via DeepSeek AI
Questions begin         ──►  All clients get question + options/input + timer
Players answer          ──►  First answer locks in; server scores immediately
All answered / time up  ──►  Server broadcasts reveal + leaderboard
10-second reveal pause  ──►  Players can vote to skip; next question starts automatically
After last question     ──►  game_over with final leaderboard and winner
Host can Play Again     ──►  Resets scores, returns everyone to lobby
```

---

## Scoring

| Component | Value |
|---|---|
| Correct answer | 1 000 pts |
| Time bonus | Up to +400 pts (proportional to time remaining) |
| Streak bonus | +100 pts × streak count, capped at +500 |
| Wrong / no answer | 0 pts, streak resets to 0 |

---

## API endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/stats` | Returns `{ activePlayers }` count |
| `POST` | `/api/upload` | Upload a file (multipart form, field: `file`). Returns extracted text |

---

## WebSocket messages

### Client → Server

| `type` | Fields | Description |
|---|---|---|
| `create_room` | `name` | Create a new lobby and become host |
| `join_room` | `name`, `code` | Join an existing lobby |
| `set_context` | `context`, `instructions`, `language` | Host sets the AI question source |
| `update_settings` | `questions`, `timer`, `maxPlayers`, `difficulty` | Host updates game settings |
| `set_question_mode` | `mode` | Host switches between `multi` / `open` |
| `start_game` | `questions`, `timer` | Host starts the game |
| `answer` | `index` | Player submits a multiple-choice answer (0-based) |
| `open_answer` | `text` | Player submits an open-ended answer |
| `vote_skip` | — | Player votes to skip the current reveal |
| `chat` | `text` | Broadcast a chat message to the room |
| `play_again` | — | Host resets the room for another round |
| `leave_room` | — | Player leaves the current room |

### Server → Client

| `type` | Description |
|---|---|
| `connected` | Assigned `pid` on connection |
| `created` / `joined` | Room creation / join confirmation with `code` |
| `room_state` | Full snapshot of players, scores, settings |
| `player_joined` / `player_left` | Player roster change |
| `rooms_update` | Live rooms list broadcast |
| `context_set` | AI source accepted |
| `status` | Informational message (e.g. "AI is generating questions…") |
| `game_starting` | Triggers countdown overlay |
| `question` | Question text, options, topic, duration, mode |
| `timer` | Remaining seconds tick |
| `answer_result` | Private: correct/wrong, points, new score |
| `player_answered` | Broadcast: answered count |
| `reveal` | Correct answer, explanation, leaderboard |
| `game_over` | Final leaderboard and winner |
| `lobby_reset` | Players return to lobby after Play Again |
| `error` | Error string |

---

## AI question generation

When `DEEPSEEK_API_KEY` is set and the host has provided content:

1. The server sends a connectivity ping to the DeepSeek API.
2. If the ping succeeds, it sends the context (up to 380 000 characters) with a system prompt requesting a JSON array of question objects.
3. Questions include LaTeX math formatting (`\(...\)` inline, `\[...\]` display).
4. For open-ended mode, the AI also grades free-text answers with tolerance for minor spelling differences.
5. If generation fails for any reason, the server notifies the client with an error.

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `Enter` | Submit the Create / Join form on the home screen |
| `1` `2` `3` `4` | Pick answer A / B / C / D during a question |

---

## Development

### Adding a new message type

1. Add a `case` in `src/messageHandler.js` and write a handler method.
2. If it needs game logic, call into `src/gameLoop.js` or `src/roomHelpers.js`.
3. On the client, add a matching `case` in `web/js/messages.js`.

### Swapping the AI provider

All AI logic is isolated in `src/questions.js`. Replace `_ping()` and `_fetchQuestions()` with calls to any other chat completion API and update the `AI_URL` and `_headers()` constants.

---

## Tech stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ |
| HTTP server | Express 5 |
| WebSocket | ws |
| Auth | Supabase (email/password + guest) |
| AI | DeepSeek API (deepseek-chat) |
| Document parsing | markitdown-ts |
| File upload | Multer |
| Math rendering | MathJax (client-side) |
| Deployment | Render |

---

## License

ISC
