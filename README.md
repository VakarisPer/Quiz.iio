# 🎯 Quizza

> Real-time multiplayer quiz game — create a room, share the code, and race against the clock.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-quizza.online-blue?style=flat-square)](https://www.quizza.online/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green?style=flat-square&logo=node.js)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-ISC-yellow?style=flat-square)](LICENSE)

A host creates a room, shares the 5-character code, players join, and the server runs a timed question-and-answer loop with live scoring and a leaderboard.

Optionally, the host can paste study notes or upload a file (`.txt`, `.pdf`, `.docx`, …) and the server will call the **DeepSeek API** to generate custom questions from that content. Without an API key the game falls back to a built-in question bank covering Electronics, Data Structures, Networking, Algorithms, and Hardware.

---

## Table of Contents

- [Features](#features)
- [Project Layout](#project-layout)
- [Requirements](#requirements)
- [Setup](#setup)
- [Environment Variables](#environment-variables)
- [How a Game Works](#how-a-game-works)
- [Scoring](#scoring)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [WebSocket Message Reference](#websocket-message-reference)
- [AI Question Generation](#ai-question-generation)
- [Extending the Project](#extending-the-project)

---

## Features

- 🏠 **Lobby system** — host creates a room; players join with a short code
- ⏱️ **Configurable rounds** — 5–20 questions, 10–60 seconds per question
- 🤖 **AI-generated questions** — paste notes or upload a file; DeepSeek turns it into a quiz
- 📄 **Rich file support** — `.txt`, `.pdf`, `.docx`, and more via `officeparser` / `pdf-parse`
- 📊 **Live leaderboard** — updated after every question
- 🔥 **Streak bonuses** — consecutive correct answers multiply your score
- 💬 **In-game chat** — players can message each other during the lobby
- 🔁 **Play Again** — host resets scores and starts a new round without anyone leaving
- ⌨️ **Keyboard shortcuts** — answer with `1`–`4`, submit forms with `Enter`

---

## Project Layout

```
Quizza/
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

- **Node.js 18+** (built-in `fetch` is required for AI requests)
- **npm**

---

## Setup

**1. Clone the repo and install dependencies**

```bash
git clone https://github.com/VakarisPer/Quizza.git
cd Quizza
npm install
```

**2. Create a `.env` file** in the project root

```env
PORT=3000
DEEPSEEK_API_KEY=your_key_here
LOG_LEVEL=INFO
```

All three variables are optional — the server runs fine with defaults and the fallback question bank.

**3. Start the server**

```bash
# Production
npm start

# Development (auto-restarts on file changes via nodemon)
npm run dev
```

Open `http://localhost:3000` in your browser. Share the room code with friends and start quizzing!

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | TCP port the server listens on |
| `DEEPSEEK_API_KEY` | *(empty)* | DeepSeek API key. Leave blank to use the built-in question bank |
| `LOG_LEVEL` | `INFO` | Verbosity: `DEBUG`, `INFO`, `WARN`, or `ERROR` |

---

## How a Game Works

```
Host creates room  ──►  Room gets a 5-char code
Players join       ──►  Code shared out-of-band
Host configures    ──►  Question count (5–20), seconds per question (10–60)
Host sets source   ──►  Optional: paste text or upload a file (.txt, .pdf, .docx…)
Host clicks Start  ──►  3-second countdown broadcasts to everyone
                   ──►  Server fetches / AI-generates questions
Q1 broadcasts      ──►  All clients receive question + options + timer
Players answer     ──►  First answer locks in; server scores immediately
                        Points = 1 000 base + time bonus (≤ 400) + streak bonus (≤ 500)
Time up / all done ──►  Server broadcasts correct answer, explanation, leaderboard
10-second pause    ──►  Next question starts automatically
After last Q       ──►  game_over with final leaderboard and winner
Host → Play Again  ──►  Resets scores, returns everyone to lobby
```

---

## Scoring

| Component | Value |
|---|---|
| Correct answer | 1 000 pts |
| Time bonus | Up to +400 pts (proportional to time remaining) |
| Streak bonus | +100 pts × streak count, capped at +500 pts |
| Wrong / no answer | 0 pts — streak resets to 0 |

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `Enter` | Submit the Create / Join form on the home screen |
| `1` `2` `3` `4` | Select answer A / B / C / D during a question |

---

## WebSocket Message Reference

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
| `leave_room` | — | Player voluntarily leaves the room |

### Server → Client

| `type` | Description |
|---|---|
| `connected` | Sent on connect with the assigned `pid` |
| `created` / `joined` | Confirms room creation / joining; includes `code` |
| `room_state` | Full snapshot of players, scores, and room state |
| `player_joined` / `player_left` | Player roster change notification |
| `context_set` | AI source text accepted by the server |
| `status` | Informational message (e.g. "AI is generating questions…") |
| `game_starting` | Triggers the client 3-2-1 countdown overlay |
| `question` | Question text, answer options, topic, and duration |
| `timer` | Remaining-seconds tick (broadcast every second) |
| `answer_result` | Private: correct/wrong, points earned, new total score |
| `player_answered` | Broadcast: how many players have answered so far |
| `reveal` | Correct answer index, explanation, and updated leaderboard |
| `game_over` | Final leaderboard and winner |
| `lobby_reset` | All players return to lobby after Play Again |
| `error` | Human-readable error string |

---

## AI Question Generation

When `DEEPSEEK_API_KEY` is set and the host has saved a context source:

1. The server sends a connectivity ping to the DeepSeek API before the full request.
2. On success, it sends the context (up to 6 000 characters) with a prompt asking for a JSON array of question objects.
3. Markdown code-fences in the response are stripped before JSON parsing.
4. If any step fails or the response is invalid, the server silently falls back to the built-in question bank.

**Supported upload formats:** `.txt`, `.pdf`, `.docx`, `.pptx`, and other formats handled by `officeparser`.

---

## Extending the Project

### Adding a new WebSocket message type

1. Add a `case` in `src/messageHandler.js` and implement a `_myAction()` method.
2. If it needs game logic, call into `src/gameLoop.js` or `src/roomHelpers.js`.
3. Add a matching `case` in `web/js/messages.js` on the client side.

No other files need to change.

### Swapping the AI provider

All AI logic is isolated in `src/questions.js`. Replace `_ping()` and `_fetchQuestions()` with calls to any other chat-completion API and update the `AI_URL` and `_headers()` constants. Nothing else in the codebase references the AI directly.
