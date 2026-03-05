import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc-channels'

contextBridge.exposeInMainWorld('electronAPI', {
  listClaudeSessions: () =>
    ipcRenderer.invoke(IPC.LIST_CLAUDE_SESSIONS) as Promise<
      { sessionId: string; cwd: string; updatedAt: string; size: number; summary: string }[]
    >,
  pickFolder: () => ipcRenderer.invoke(IPC.PICK_FOLDER) as Promise<string | null>,
  openExternal: (url: string) => ipcRenderer.invoke(IPC.OPEN_EXTERNAL, url),
  spawnLocalPty: (sessionId: string, command: string, workDir: string) =>
    ipcRenderer.invoke(IPC.LOCAL_PTY_SPAWN, sessionId, command, workDir) as Promise<{ ok: boolean; error?: string }>,
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
  }
})
