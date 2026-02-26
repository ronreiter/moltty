import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron'
import { join } from 'path'
import { homedir } from 'os'
import { readdirSync, readFileSync, statSync } from 'fs'
import { IPC } from '../shared/ipc-channels'
import { saveTokens, loadTokens, clearTokens, TokenData } from './auth-store'
import { WorkerManager } from './worker-manager'
import { loadWorkerConfig, ensureWorkerId } from './worker-store'

let mainWindow: BrowserWindow | null = null
let workerManager: WorkerManager | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
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

            const firstLine = raw.split('\n')[0]
            if (!firstLine) continue
            const meta = JSON.parse(firstLine)
            const st = statSync(filePath)

            // Extract first user message as summary
            let summary = ''
            const lines = raw.split('\n')
            for (const line of lines) {
              if (!line) continue
              try {
                const obj = JSON.parse(line)
                if (obj.type === 'user' && obj.message) {
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
                    break
                  }
                }
              } catch {
                // skip unparseable lines (may be truncated at end of buffer)
              }
            }

            results.push({
              sessionId: meta.sessionId || file.replace('.jsonl', ''),
              cwd: meta.cwd || '/' + dir.replace(/-/g, '/').replace(/^\//, ''),
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

ipcMain.handle(IPC.PICK_FOLDER, async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Choose working directory'
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
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
