import { app, BrowserWindow, ipcMain, shell, dialog, nativeImage } from 'electron'
import { join } from 'path'
import { homedir } from 'os'
import { readdirSync, readFileSync, writeFileSync, statSync, mkdirSync, existsSync } from 'fs'
import { IPC } from '../shared/ipc-channels'

app.setName('Moltty')

let mainWindow: BrowserWindow | null = null

// Local PTY sessions
const localPtySessions = new Map<string, ReturnType<typeof import('node-pty').spawn>>()


function createWindow(): void {
  const iconPath = join(__dirname, '../../resources/icon.png')
  const icon = nativeImage.createFromPath(iconPath)

  if (process.platform === 'darwin') {
    app.dock.setIcon(icon)
  }

  mainWindow = new BrowserWindow({
    title: 'Moltty',
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

// IPC handlers — session persistence
function getSessionsPath(): string {
  const dir = join(app.getPath('userData'), 'moltty-data')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'sessions.json')
}

ipcMain.handle(IPC.LOAD_SESSIONS, () => {
  try {
    const raw = readFileSync(getSessionsPath(), 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
})

ipcMain.handle(IPC.SAVE_SESSIONS, (_event, data: string) => {
  try {
    writeFileSync(getSessionsPath(), data, 'utf-8')
  } catch {
    // write failed
  }
})

// Settings persistence (~/.moltty.settings)
function getSettingsPath(): string {
  return join(homedir(), '.moltty.settings')
}

ipcMain.handle(IPC.LOAD_SETTINGS, () => {
  try {
    const raw = readFileSync(getSettingsPath(), 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
})

ipcMain.handle(IPC.SAVE_SETTINGS, (_event, data: string) => {
  try {
    writeFileSync(getSettingsPath(), data, 'utf-8')
  } catch {
    // write failed
  }
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
            const fd = require('fs').openSync(filePath, 'r')
            const headBuf = Buffer.alloc(Math.min(64 * 1024, statSync(filePath).size))
            require('fs').readSync(fd, headBuf, 0, headBuf.length, 0)
            require('fs').closeSync(fd)
            const raw = headBuf.toString('utf-8')

            const st = statSync(filePath)
            const lines = raw.split('\n')

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
ipcMain.handle(IPC.LOCAL_PTY_SPAWN, (_event, sessionId: string, command: string, workDir: string, loadZshrc: boolean) => {
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

  try {
    const pty = require('node-pty')
    const cleanEnv = { ...process.env }
    delete cleanEnv.CLAUDECODE
    delete cleanEnv.CLAUDE_CODE_ENTRYPOINT
    delete cleanEnv.CLAUDE_SESSION_ID

    console.log(`LOCAL_PTY_SPAWN: sessionId=${sessionId} command=${command} cwd=${resolvedDir}`)

    const shellArgs = loadZshrc !== false
      ? ['-l', '-i', '-c', command]
      : ['-l', '-c', command]
    const ptyProcess = pty.spawn('/bin/zsh', shellArgs, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: resolvedDir,
      env: {
        ...cleanEnv,
        TERM: 'xterm-256color',
        HOME: homedir()
      }
    })

    localPtySessions.set(sessionId, ptyProcess)

    // Detect tool session ID after spawn (for tools that support --resume)
    const isResuming = parts.includes('--resume')
    if (parts[0] === 'claude' && !isResuming) {
      // Claude: detect session ID from ~/.claude/projects/
      const projectDirName = resolvedDir.replace(/\//g, '-')
      const claudeProjectDir = join(homedir(), '.claude', 'projects', projectDirName)
      const beforeFiles = new Set<string>()
      try {
        readdirSync(claudeProjectDir).filter(f => f.endsWith('.jsonl')).forEach(f => beforeFiles.add(f))
      } catch {}

      let pollCount = 0
      const pollInterval = setInterval(() => {
        pollCount++
        if (pollCount > 30 || !localPtySessions.has(sessionId)) {
          clearInterval(pollInterval)
          return
        }
        try {
          const files = readdirSync(claudeProjectDir).filter(f => f.endsWith('.jsonl'))
          const newFile = files.find(f => !beforeFiles.has(f))
          if (newFile) {
            clearInterval(pollInterval)
            const toolSessionId = newFile.replace('.jsonl', '')
            console.log(`TOOL_SESSION_DETECTED: molttySession=${sessionId} toolSession=${toolSessionId}`)
            mainWindow?.webContents.send(IPC.TOOL_SESSION_DETECTED, sessionId, toolSessionId)
          }
        } catch {}
      }, 500)
    } else if (parts[0] === 'gemini' && !isResuming) {
      // Gemini CLI: detect session ID from ~/.gemini/sessions/
      const geminiSessionsDir = join(homedir(), '.gemini', 'sessions')
      const beforeFiles = new Set<string>()
      try {
        readdirSync(geminiSessionsDir).forEach(f => beforeFiles.add(f))
      } catch {}

      let pollCount = 0
      const pollInterval = setInterval(() => {
        pollCount++
        if (pollCount > 30 || !localPtySessions.has(sessionId)) {
          clearInterval(pollInterval)
          return
        }
        try {
          const files = readdirSync(geminiSessionsDir)
          const newFile = files.find(f => !beforeFiles.has(f))
          if (newFile) {
            clearInterval(pollInterval)
            const toolSessionId = newFile.replace(/\.[^.]+$/, '')
            console.log(`TOOL_SESSION_DETECTED: molttySession=${sessionId} toolSession=${toolSessionId}`)
            mainWindow?.webContents.send(IPC.TOOL_SESSION_DETECTED, sessionId, toolSessionId)
          }
        } catch {}
      }, 500)
    }

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

app.whenReady().then(() => {
  createWindow()
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
