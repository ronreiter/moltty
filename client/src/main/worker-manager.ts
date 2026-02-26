import WebSocket from 'ws'
import { homedir } from 'os'
import { mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

interface ServerMessage {
  type: string
  sessionId: string
  command?: string
  workDir?: string
  data?: string // base64
  cols?: number
  rows?: number
}

interface PTYSession {
  ptyProcess: ReturnType<typeof import('node-pty').spawn>
  workDir: string
}

export class WorkerManager {
  private ws: WebSocket | null = null
  private sessions = new Map<string, PTYSession>()
  private accessToken: string
  private workerId: string
  private workerName: string
  private reconnectAttempts = 0
  private maxReconnectAttempts = 20
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private intentionalDisconnect = false
  private _isConnected = false
  private statusCallbacks: ((connected: boolean) => void)[] = []
  private serverUrl = 'ws://localhost:8082/api/worker/ws'

  constructor(accessToken: string, workerId: string, workerName: string) {
    this.accessToken = accessToken
    this.workerId = workerId
    this.workerName = workerName
  }

  get isConnected(): boolean {
    return this._isConnected
  }

  onStatusChange(cb: (connected: boolean) => void): void {
    this.statusCallbacks.push(cb)
  }

  private setConnected(connected: boolean): void {
    if (this._isConnected !== connected) {
      this._isConnected = connected
      for (const cb of this.statusCallbacks) {
        cb(connected)
      }
    }
  }

  connect(): void {
    this.intentionalDisconnect = false
    const url = `${this.serverUrl}?token=${this.accessToken}&workerId=${this.workerId}`

    try {
      this.ws = new WebSocket(url)
    } catch (err) {
      console.error('WorkerManager: failed to create WebSocket:', err)
      this.scheduleReconnect()
      return
    }

    this.ws.on('open', () => {
      console.log('WorkerManager: connected to server')
      this.reconnectAttempts = 0
      this.setConnected(true)
    })

    this.ws.on('message', (raw: WebSocket.RawData) => {
      try {
        const msg: ServerMessage = JSON.parse(raw.toString())
        this.handleServerMessage(msg)
      } catch (err) {
        console.error('WorkerManager: invalid message:', err)
      }
    })

    this.ws.on('close', () => {
      console.log('WorkerManager: disconnected from server')
      this.setConnected(false)
      if (!this.intentionalDisconnect) {
        this.scheduleReconnect()
      }
    })

    this.ws.on('error', (err: Error) => {
      console.error('WorkerManager: WebSocket error:', err.message)
    })
  }

  disconnect(): void {
    this.intentionalDisconnect = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    // Kill all PTY processes
    for (const [sessionId, session] of this.sessions) {
      try {
        session.ptyProcess.kill()
      } catch {
        // process may already be dead
      }
      this.sessions.delete(sessionId)
    }

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.setConnected(false)
  }

  updateToken(accessToken: string): void {
    this.accessToken = accessToken
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('WorkerManager: max reconnect attempts reached')
      return
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000)
    this.reconnectAttempts++
    console.log(`WorkerManager: reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)

    this.reconnectTimer = setTimeout(() => {
      this.connect()
    }, delay)
  }

  private handleServerMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case 'spawn':
        this.spawnSession(msg.sessionId, msg.command || 'claude', msg.workDir || '~')
        break
      case 'input':
        this.handleInput(msg.sessionId, msg.data || '')
        break
      case 'resize':
        this.handleResize(msg.sessionId, msg.cols || 80, msg.rows || 24)
        break
      case 'kill':
        this.handleKill(msg.sessionId)
        break
      case 'ping':
        this.sendMessage({ type: 'pong' })
        break
    }
  }

  private spawnSession(sessionId: string, command: string, workDir: string): void {
    // Resolve working directory
    let resolvedDir = workDir
    if (resolvedDir === '~' || resolvedDir.startsWith('~/')) {
      resolvedDir = resolvedDir.replace('~', homedir())
    }

    // Create session directory
    const sessionDir = join(homedir(), '.moltty', 'sessions', sessionId)
    mkdirSync(sessionDir, { recursive: true })

    // Ensure working directory exists
    try {
      mkdirSync(resolvedDir, { recursive: true })
    } catch {
      resolvedDir = homedir()
    }

    // Parse command into program and args
    const parts = command.split(/\s+/)
    let program = parts[0]
    const args = parts.slice(1)

    // Resolve program to absolute path if needed
    if (!program.startsWith('/')) {
      try {
        const resolved = execSync(`zsh -lc "which ${program}"`, { encoding: 'utf-8' }).trim()
        if (resolved) program = resolved
      } catch {
        // try common locations
        const commonPaths = [
          join(homedir(), '.local', 'bin', program),
          `/usr/local/bin/${program}`,
          `/opt/homebrew/bin/${program}`
        ]
        for (const p of commonPaths) {
          if (existsSync(p)) {
            program = p
            break
          }
        }
      }
    }

    // Get full shell PATH
    let shellPath = process.env.PATH || ''
    try {
      shellPath = execSync('zsh -lc "echo $PATH"', { encoding: 'utf-8' }).trim()
    } catch {
      // keep existing PATH
    }

    try {
      // Dynamic require for node-pty (native module)
      const pty = require('node-pty')

      // Build clean environment (strip Claude Code nesting detection vars)
      const cleanEnv = { ...process.env }
      delete cleanEnv.CLAUDECODE
      delete cleanEnv.CLAUDE_CODE_ENTRYPOINT
      delete cleanEnv.CLAUDE_SESSION_ID

      const ptyProcess = pty.spawn(program, args, {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: resolvedDir,
        env: {
          ...cleanEnv,
          PATH: shellPath,
          TERM: 'xterm-256color',
          MOLTTY_SESSION_ID: sessionId,
          HOME: homedir()
        }
      })

      this.sessions.set(sessionId, { ptyProcess, workDir: resolvedDir })

      // Wire PTY output -> server
      ptyProcess.onData((data: string) => {
        const encoded = Buffer.from(data).toString('base64')
        this.sendMessage({
          type: 'output',
          sessionId,
          data: encoded
        })
      })

      // Wire PTY exit
      ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
        this.sessions.delete(sessionId)
        this.sendMessage({
          type: 'session-exited',
          sessionId,
          exitCode
        })
      })

      // Notify server that session started
      this.sendMessage({
        type: 'session-started',
        sessionId
      })

      console.log(`WorkerManager: spawned session ${sessionId} (${command} in ${resolvedDir})`)
    } catch (err) {
      console.error(`WorkerManager: failed to spawn session ${sessionId}:`, err)
      this.sendMessage({
        type: 'session-exited',
        sessionId,
        exitCode: 1
      })
    }
  }

  private handleInput(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return

    const decoded = Buffer.from(data, 'base64').toString()
    session.ptyProcess.write(decoded)
  }

  private handleResize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId)
    if (!session) return

    try {
      session.ptyProcess.resize(cols, rows)
    } catch {
      // resize may fail if process is exiting
    }
  }

  private handleKill(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return

    try {
      session.ptyProcess.kill()
    } catch {
      // process may already be dead
    }
    this.sessions.delete(sessionId)
  }

  private sendMessage(msg: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }
}
