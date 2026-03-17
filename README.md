# QuizForge

Real-time multiplayer quiz game. A host creates a room, shares the code, players join, and the server runs a timed question-and-answer loop with live scoring.

Optionally, the host can paste study notes or upload a `.txt` file and the server will call the DeepSeek API to generate questions from that content. Without an API key the game falls back to a built-in question bank.

---

## Project layout

```
quizforge/
├── web/                    # Client (static files served by the Node server)
│   ├── index.html          # All screens and HTML markup
│   ├── style.css           # Full stylesheet
│   └── js/
│       ├── utils.js        # DOM helpers: q(), qs(), h(), setNotice()
│       ├── state.js        # Shared mutable state (myPid, myName, isHost)
│       ├── toast.js        # Toast notification popups
│       ├── screens.js      # ScreenManager — shows/hides screens
│       ├── connection.js   # ConnectionManager — WebSocket lifecycle
│       ├── timer.js        # TimerManager — SVG ring countdown
│       ├── countdown.js    # CountdownOverlay — full-screen 3-2-1
│       ├── renderer.js     # GameRenderer — options, leaderboard, player list
│       ├── lobby.js        # LobbyController — create/join/settings/upload
│       ├── game.js         # GameController — question/reveal/results
│       ├── messages.js     # MessageHandler — routes server messages
│       ├── keyboard.js     # KeyboardController — Enter + 1-4 hotkeys
│       └── app.js          # App namespace + boot
│
├── src/                    # Server modules
│   ├── config.js           # All env vars and tunable constants
│   ├── logger.js           # Colour-coded, level-filtered logger
│   ├── utils.js            # makeCode(), makePid()
│   ├── player.js           # PlayerFactory.create()
│   ├── roomStore.js        # Shared rooms Map + pidToRoom Map
│   ├── roomHelpers.js      # broadcast, sendTo, leaderboard, snapshot, removePlayer
│   ├── questions.js        # QuestionService — DeepSeek AI + fallback bank
│   ├── gameLoop.js         # startGame, runQuestion, revealAnswer, endGame
│   ├── messageHandler.js   # One method per WebSocket message type
│   ├── httpServer.js       # HttpServer — static file serving
│   └── wsServer.js         # WsServer — WebSocket connection lifecycle
│
└── server.js               # Entry point — wires and boots everything
```

---

## Requirements

- Node.js 18 or later (`fetch` is needed for the AI requests)
- npm

---

## Setup

**1. Install dependencies**

```bash
npm install
```

The only runtime dependencies are `ws` and `dotenv`.

```bash
npm install ws dotenv
```

**2. Create `.env`**

```env
PORT=3000
DEEPSEEK_API_KEY=your_key_here
LOG_LEVEL=INFO
```

All three keys are optional. The server runs without them using defaults and the fallback question bank.

**3. Place the client files**

Put the `web/` folder (containing `index.html`, `style.css`, and `js/`) at the root of the project. The HTTP server serves everything from that folder.

**4. Start**

```bash
node server.js
```

Open `http://localhost:3000` in your browser.

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | TCP port the server listens on |
| `DEEPSEEK_API_KEY` | *(empty)* | DeepSeek API key. Leave blank to use the built-in question bank |
| `LOG_LEVEL` | `INFO` | Verbosity: `DEBUG`, `INFO`, `WARN`, or `ERROR` |

---

## How a game works

```
Host creates room  ──►  Room gets a 5-char code
Players join            ──►  Code shared out-of-band
Host configures         ──►  Questions count (5–20), seconds per question (10–60)
Host sets AI source     ──►  Optional: paste text or upload .txt
Host clicks Start       ──►  3-second countdown broadcasts to everyone
                        ──►  Server fetches/generates questions
Q1 broadcasts           ──►  All clients get question + options + timer
Players answer          ──►  First answer locks in; server scores immediately
                              Points = 1000 base + time bonus (up to 400) + streak bonus (100×streak, max 500)
All answered / time up  ──►  Server broadcasts reveal + leaderboard
10-second pause         ──►  Next question starts automatically
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

## WebSocket message reference

### Client → Server

| `type` | Fields | Description |
|---|---|---|
| `create_room` | `name` | Create a new lobby and become host |
| `join_room` | `name`, `code` | Join an existing lobby |
| `set_context` | `context` | Host sets the AI question source text |
| `start_game` | `questions`, `timer` | Host starts the game with chosen settings |
| `answer` | `index` | Player submits a 0-based answer index |
| `chat` | `text` | Broadcast a chat message to the room |
| `play_again` | — | Host resets the room for another round |
| `leave_room` | — | Player leaves the current room |

### Server → Client

| `type` | Description |
|---|---|
| `connected` | Sent on connect with the assigned `pid` |
| `created` / `joined` | Confirms room creation / joining with `code` |
| `room_state` | Full snapshot of players, scores, and room state |
| `player_joined` / `player_left` | Player roster change |
| `context_set` | AI source accepted by the server |
| `status` | Informational message (e.g. "AI is generating questions…") |
| `game_starting` | Triggers the client countdown overlay |
| `question` | Question text, options, topic, duration |
| `timer` | Remaining seconds tick (sent every second) |
| `answer_result` | Private: correct/wrong, points earned, new score |
| `player_answered` | Broadcast: how many players have answered so far |
| `reveal` | Correct index, explanation, and full leaderboard |
| `game_over` | Final leaderboard and winner |
| `lobby_reset` | All players return to the lobby after Play Again |
| `error` | Human-readable error string |

---

## AI question generation

When `DEEPSEEK_API_KEY` is set and the host has saved a context source:

1. The server sends a connectivity ping to the DeepSeek API before the full request.
2. If the ping succeeds, it sends the context (up to 6 000 characters) with a prompt asking for a JSON array of question objects.
3. Any markdown fences in the response are stripped before parsing.
4. If the response is invalid or any step fails, the server silently falls back to the built-in question bank.

The built-in bank covers: Electronics, Data Structures, Networking, Algorithms, and Hardware.

---

## Keyboard shortcuts (client)

| Key | Action |
|---|---|
| `Enter` | Submit the Create / Join form on the home screen |
| `1` `2` `3` `4` | Pick answer A / B / C / D during a question |

---

## Adding a new message type

1. Add a `case` in `src/messageHandler.js` and write a `_myAction()` method.
2. If it needs game logic, call into `src/gameLoop.js` or `src/roomHelpers.js`.
3. On the client, add a matching `case` in `web/js/messages.js`.

No other files need to change.

---

## Swapping the AI provider

All AI logic is isolated in `src/questions.js`. Replace `_ping()` and `_fetchQuestions()` with calls to any other chat completion API and update the `AI_URL` and `_headers()` constants. Nothing else in the codebase references the AI directly.
