import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC } from '../shared/ipc-channels'

contextBridge.exposeInMainWorld('electronAPI', {
  loadSessions: () => ipcRenderer.invoke(IPC.LOAD_SESSIONS),
  saveSessions: (data: string) => ipcRenderer.invoke(IPC.SAVE_SESSIONS, data),
  loadSettings: () => ipcRenderer.invoke(IPC.LOAD_SETTINGS),
  saveSettings: (data: string) => ipcRenderer.invoke(IPC.SAVE_SETTINGS, data),
  listClaudeSessions: () =>
    ipcRenderer.invoke(IPC.LIST_CLAUDE_SESSIONS) as Promise<
      { sessionId: string; cwd: string; updatedAt: string; size: number; summary: string }[]
    >,
  pickFolder: () => ipcRenderer.invoke(IPC.PICK_FOLDER) as Promise<string | null>,
  openExternal: (url: string) => ipcRenderer.invoke(IPC.OPEN_EXTERNAL, url),
  openPath: (filePath: string) => ipcRenderer.invoke(IPC.OPEN_PATH, filePath),
  spawnLocalPty: (sessionId: string, command: string, workDir: string, loadZshrc?: boolean) =>
    ipcRenderer.invoke(IPC.LOCAL_PTY_SPAWN, sessionId, command, workDir, loadZshrc) as Promise<{ ok: boolean; error?: string }>,
  sendLocalPtyInput: (sessionId: string, data: string) =>
    ipcRenderer.send(IPC.LOCAL_PTY_INPUT, sessionId, data),
  resizeLocalPty: (sessionId: string, cols: number, rows: number) =>
    ipcRenderer.send(IPC.LOCAL_PTY_RESIZE, sessionId, cols, rows),
  killLocalPty: (sessionId: string) =>
    ipcRenderer.invoke(IPC.LOCAL_PTY_KILL, sessionId),
  onLocalPtyOutput: (cb: (sessionId: string, data: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, sessionId: string, data: string) => cb(sessionId, data)
    ipcRenderer.on(IPC.LOCAL_PTY_OUTPUT, listener)
    return () => ipcRenderer.removeListener(IPC.LOCAL_PTY_OUTPUT, listener)
  },
  onLocalPtyExit: (cb: (sessionId: string, exitCode: number) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, sessionId: string, exitCode: number) => cb(sessionId, exitCode)
    ipcRenderer.on(IPC.LOCAL_PTY_EXIT, listener)
    return () => ipcRenderer.removeListener(IPC.LOCAL_PTY_EXIT, listener)
  },
  onClaudeSessionDetected: (cb: (sessionId: string, claudeSessionId: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, sessionId: string, claudeSessionId: string) => cb(sessionId, claudeSessionId)
    ipcRenderer.on(IPC.CLAUDE_SESSION_DETECTED, listener)
    return () => ipcRenderer.removeListener(IPC.CLAUDE_SESSION_DETECTED, listener)
  },
  onToolSessionDetected: (cb: (sessionId: string, toolSessionId: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, sessionId: string, toolSessionId: string) => cb(sessionId, toolSessionId)
    ipcRenderer.on(IPC.TOOL_SESSION_DETECTED, listener)
    return () => ipcRenderer.removeListener(IPC.TOOL_SESSION_DETECTED, listener)
  },
  getGitBranch: (workDir: string) => ipcRenderer.invoke(IPC.GET_GIT_BRANCH, workDir) as Promise<string | null>,
  createGitWorktree: (workDir: string) => ipcRenderer.invoke(IPC.CREATE_GIT_WORKTREE, workDir) as Promise<{ ok: boolean; path?: string; branch?: string; error?: string }>,
  showNotification: (title: string, body: string) => ipcRenderer.send(IPC.SHOW_NOTIFICATION, title, body),
  sendFileDrop: (text: string) => ipcRenderer.send(IPC.FILE_DROP, text),
  setActiveSessionMain: (sessionId: string) => ipcRenderer.send(IPC.SET_ACTIVE_SESSION, sessionId),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  forceQuit: () => ipcRenderer.send(IPC.FORCE_QUIT),
  onQuitConfirm: (cb: (show: boolean) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, show: boolean) => cb(show)
    ipcRenderer.on('quit-confirm', listener)
    return () => ipcRenderer.removeListener('quit-confirm', listener)
  }
})
