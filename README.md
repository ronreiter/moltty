# Moltty

Remote terminal multiplexer for Claude Code. Run Claude Code locally on your Mac with native credentials and filesystem access — view and interact with sessions from any device.

## How It Works

```
[Mac App / Viewer] --ws--> [Server: relay + scrollback] <--ws-- [Mac App / Worker]
[Web Browser]      --ws--> [Server]
[Phone]            --ws--> [Server]
```

- **Worker** — Mac Electron app, runs `claude` locally via `node-pty`, streams PTY I/O to the server
- **Server** — Go relay, stores scrollback, fans out to viewers, manages session lifecycle
- **Viewer** — Any client with xterm.js (Electron app, web browser, phone)

## Features

- **Native execution** — Claude Code runs on your Mac with full access to your filesystem, git, credentials, and tools
- **Access from anywhere** — Connect from any browser or the Electron app
- **Session persistence** — Sessions survive disconnects and auto-resume with `claude --continue` when the worker reconnects
- **Scrollback buffer** — New viewers instantly see everything Claude has output
- **Multi-viewer** — Multiple clients can watch and interact with the same session simultaneously
- **Session history** — Browse and resume any previous Claude Code conversation

## Prerequisites

- macOS (worker)
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed (`claude` CLI)
- Go 1.24+
- Node.js 20+
- Docker & Docker Compose (for PostgreSQL)

## Quick Start

### 1. Start infrastructure

```bash
make up
```

This starts PostgreSQL and Chisel via Docker Compose.

### 2. Build and run the server

```bash
make server-build
make server-dev
```

The server starts on `http://localhost:8082`.

### 3. Install and run the client

```bash
make client-install
make client-dev
```

The Electron app opens. Register an account, and the worker auto-connects. Click **+ New Session** to pick a working directory and start Claude Code.

## Project Structure

```
server/               Go backend (Fiber + GORM + PostgreSQL)
  cmd/server/           Entry point
  internal/
    auth/               JWT auth, Google OAuth
    config/             Environment config
    container/          Docker container management (legacy)
    database/           GORM database connection
    proxy/              WebSocket terminal proxy
    session/            Session CRUD and lifecycle
    user/               User model and repository
    worker/             Worker hub, protocol, scrollback
  web/                  Web terminal viewer

client/               Electron + React frontend
  src/
    main/               Electron main process (worker manager, IPC)
    renderer/           React UI (terminal, sidebar, auth)
    shared/             Shared IPC channel definitions

container/            Container session image (legacy)
  pty-bridge/           PTY-to-WebSocket bridge
```

## License

[MIT](LICENSE)
