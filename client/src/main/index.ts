import { app, BrowserWindow, ipcMain, shell, dialog, nativeImage } from 'electron'
import { join } from 'path'
import { homedir } from 'os'
import { readdirSync, readFileSync, statSync, existsSync, mkdirSync } from 'fs'
import { execSync } from 'child_process'
import { IPC } from '../shared/ipc-channels'
import { saveTokens, loadTokens, clearTokens, TokenData } from './auth-store'
import { WorkerManager } from './worker-manager'
import { loadWorkerConfig, ensureWorkerId } from './worker-store'

app.setName('Moltty')

let mainWindow: BrowserWindow | null = null
let workerManager: WorkerManager | null = null

// Local PTY sessions
const localPtySessions = new Map<string, ReturnType<typeof import('node-pty').spawn>>()

// Cache shell PATH (resolved once, reused for all spawns)
let cachedShellPath: string | null = null
function getShellPath(): string {
  if (cachedShellPath !== null) return cachedShellPath
  try {
    cachedShellPath = execSync('zsh -lc "echo $PATH"', { encoding: 'utf-8', timeout: 5000 }).trim()
  } catch {
    cachedShellPath = process.env.PATH || ''
  }
  return cachedShellPath
}

const resolvedProgramCache = new Map<string, string>()
function resolveProgram(name: string): string {
  if (name.startsWith('/')) return name
  const cached = resolvedProgramCache.get(name)
  if (cached) return cached
  let resolved = name
  try {
    resolved = execSync(`zsh -lc "which ${name}"`, { encoding: 'utf-8', timeout: 5000 }).trim() || name
  } catch {
    const commonPaths = [
      join(homedir(), '.local', 'bin', name),
      `/usr/local/bin/${name}`,
      `/opt/homebrew/bin/${name}`
    ]
    for (const p of commonPaths) {
      if (existsSync(p)) { resolved = p; break }
    }
  }
  resolvedProgramCache.set(name, resolved)
  return resolved
}

function createWindow(): void {
  const iconPath = join(__dirname, '../../resources/icon.png')
  const icon = nativeImage.createFromPath(iconPath)

  if (process.platform === 'darwin') {
    app.dock.setIcon(icon)
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    icon,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1e1e2e',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// Register moltty:// protocol handler for OAuth callbacks
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('moltty', process.execPath, [process.argv[1]])
  }
} else {
  app.setAsDefaultProtocolClient('moltty')
}

// Handle moltty:// URLs on macOS
app.on('open-url', (_event, url) => {
  handleProtocolURL(url)
})

function handleProtocolURL(url: string): void {
  try {
    const parsed = new URL(url)
    if (parsed.hostname === 'auth-callback') {
      const accessToken = parsed.searchParams.get('accessToken')
      const refreshToken = parsed.searchParams.get('refreshToken')
      if (accessToken && refreshToken) {
        const tokens: TokenData = { accessToken, refreshToken }
        saveTokens(tokens)
        mainWindow?.webContents.send(IPC.OAUTH_CALLBACK, tokens)
        initWorker(tokens)
      }
    }
  } catch (err) {
    console.error('Failed to parse protocol URL:', err)
  }
}

function initWorker(tokens: TokenData): void {
  if (workerManager) {
    workerManager.disconnect()
  }

  const workerConfig = ensureWorkerId()
  workerManager = new WorkerManager(
    tokens.accessToken,
    workerConfig.workerId,
    workerConfig.workerName
  )

  workerManager.onStatusChange((connected) => {
    mainWindow?.webContents.send(IPC.WORKER_STATUS_CHANGE, { isConnected: connected })
  })

  workerManager.connect()
}

function stopWorker(): void {
  if (workerManager) {
    workerManager.disconnect()
    workerManager = null
  }
}

// IPC handlers
ipcMain.handle(IPC.GET_TOKEN, () => loadTokens())
ipcMain.handle(IPC.SET_TOKEN, (_event, tokens: TokenData) => {
  saveTokens(tokens)
  initWorker(tokens)
})
ipcMain.handle(IPC.CLEAR_TOKEN, () => {
  clearTokens()
  stopWorker()
})

ipcMain.handle(IPC.LIST_CLAUDE_SESSIONS, () => {
  const projectsDir = join(homedir(), '.claude', 'projects')
  const results: { sessionId: string; cwd: string; updatedAt: string; size: number; summary: string }[] = []

  try {
    const dirs = readdirSync(projectsDir)
    for (const dir of dirs) {
      const dirPath = join(projectsDir, dir)
      try {
        if (!statSync(dirPath).isDirectory()) continue
        const files = readdirSync(dirPath).filter((f) => f.endsWith('.jsonl'))
        for (const file of files) {
          const filePath = join(dirPath, file)
          try {
            // Read only the first chunk to get metadata + first user message
            const fd = require('fs').openSync(filePath, 'r')
            const headBuf = Buffer.alloc(Math.min(64 * 1024, statSync(filePath).size))
            require('fs').readSync(fd, headBuf, 0, headBuf.length, 0)
            require('fs').closeSync(fd)
            const raw = headBuf.toString('utf-8')

            const st = statSync(filePath)
            const lines = raw.split('\n')

            // Scan lines for cwd, sessionId, and first user message
            let cwd = ''
            let sessionId = ''
            let summary = ''
            for (const line of lines) {
              if (!line) continue
              try {
                const obj = JSON.parse(line)
                if (!cwd && obj.cwd) cwd = obj.cwd
                if (!sessionId && obj.sessionId) sessionId = obj.sessionId
                if (!summary && obj.type === 'user' && obj.message) {
                  const content = obj.message.content
                  let text = ''
                  if (Array.isArray(content)) {
                    const tc = content.find((c: { type: string }) => c.type === 'text')
                    if (tc) text = tc.text
                  } else if (typeof content === 'string') {
                    text = content
                  }
                  text = text.trim().split('\n')[0].slice(0, 120)
                  if (text && !text.toLowerCase().includes('interrupted')) {
                    summary = text
                  }
                }
                if (cwd && sessionId && summary) break
              } catch {
                // skip unparseable lines
              }
            }

            results.push({
              sessionId: sessionId || file.replace('.jsonl', ''),
              cwd: cwd || dir,
              updatedAt: st.mtime.toISOString(),
              size: st.size,
              summary
            })
          } catch {
            // skip unparseable files
          }
        }
      } catch {
        // skip unreadable dirs
      }
    }
  } catch {
    // ~/.claude/projects doesn't exist
  }

  // Sort by most recent first
  results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return results
})

ipcMain.handle(IPC.OPEN_EXTERNAL, (_event, url: string) => {
  shell.openExternal(url)
})

ipcMain.handle(IPC.PICK_FOLDER, async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Choose working directory'
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

// --- Local PTY handlers ---
ipcMain.handle(IPC.LOCAL_PTY_SPAWN, (_event, sessionId: string, command: string, workDir: string) => {
  // If a PTY already exists for this session, just reattach (renderer refreshed)
  const existing = localPtySessions.get(sessionId)
  if (existing) {
    console.log(`LOCAL_PTY_REATTACH: sessionId=${sessionId}`)
    return { ok: true, reattached: true }
  }

  let resolvedDir = workDir || homedir()
  if (resolvedDir === '~' || resolvedDir.startsWith('~/')) {
    resolvedDir = resolvedDir.replace('~', homedir())
  }
  try {
    mkdirSync(resolvedDir, { recursive: true })
  } catch {
    resolvedDir = homedir()
  }

  const parts = command.split(/\s+/)
  const program = resolveProgram(parts[0])
  const args = parts.slice(1)
  const shellPath = getShellPath()

  try {
    const pty = require('node-pty')
    const cleanEnv = { ...process.env }
    delete cleanEnv.CLAUDECODE
    delete cleanEnv.CLAUDE_CODE_ENTRYPOINT
    delete cleanEnv.CLAUDE_SESSION_ID

    console.log(`LOCAL_PTY_SPAWN: sessionId=${sessionId} program=${program} args=${JSON.stringify(args)} cwd=${resolvedDir}`)

    const ptyProcess = pty.spawn(program, args, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: resolvedDir,
      env: {
        ...cleanEnv,
        PATH: shellPath,
        TERM: 'xterm-256color',
        HOME: homedir()
      }
    })

    localPtySessions.set(sessionId, ptyProcess)

    ptyProcess.onData((data: string) => {
      if (localPtySessions.get(sessionId) === ptyProcess) {
        mainWindow?.webContents.send(IPC.LOCAL_PTY_OUTPUT, sessionId, data)
      }
    })

    ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
      if (localPtySessions.get(sessionId) === ptyProcess) {
        console.log(`LOCAL_PTY_EXIT: sessionId=${sessionId} exitCode=${exitCode}`)
        localPtySessions.delete(sessionId)
        mainWindow?.webContents.send(IPC.LOCAL_PTY_EXIT, sessionId, exitCode)
      }
    })

    return { ok: true, reattached: false }
  } catch (err) {
    console.error(`Failed to spawn local PTY for ${sessionId}:`, err)
    return { ok: false, error: String(err) }
  }
})

ipcMain.on(IPC.LOCAL_PTY_INPUT, (_event, sessionId: string, data: string) => {
  localPtySessions.get(sessionId)?.write(data)
})

ipcMain.on(IPC.LOCAL_PTY_RESIZE, (_event, sessionId: string, cols: number, rows: number) => {
  try {
    localPtySessions.get(sessionId)?.resize(cols, rows)
  } catch {
    // resize may fail if process is exiting
  }
})

ipcMain.handle(IPC.LOCAL_PTY_KILL, (_event, sessionId: string) => {
  const pty = localPtySessions.get(sessionId)
  if (pty) {
    try {
      pty.kill()
    } catch {
      // already dead
    }
    localPtySessions.delete(sessionId)
  }
})

ipcMain.handle(IPC.WORKER_STATUS, () => {
  const config = loadWorkerConfig()
  return {
    isConnected: workerManager?.isConnected ?? false,
    workerName: config?.workerName ?? 'Unknown'
  }
})

app.whenReady().then(() => {
  createWindow()
  // Auto-init worker if tokens exist
  const tokens = loadTokens()
  if (tokens) {
    initWorker(tokens)
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.on('before-quit', () => {
  stopWorker()
})
