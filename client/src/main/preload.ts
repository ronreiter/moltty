import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc-channels'

contextBridge.exposeInMainWorld('electronAPI', {
  getToken: () => ipcRenderer.invoke(IPC.GET_TOKEN),
  setToken: (tokens: { accessToken: string; refreshToken: string }) =>
    ipcRenderer.invoke(IPC.SET_TOKEN, tokens),
  clearToken: () => ipcRenderer.invoke(IPC.CLEAR_TOKEN),
  onOAuthCallback: (callback: (tokens: { accessToken: string; refreshToken: string }) => void) => {
    ipcRenderer.on(IPC.OAUTH_CALLBACK, (_event, tokens) => callback(tokens))
  },
  getWorkerStatus: () =>
    ipcRenderer.invoke(IPC.WORKER_STATUS) as Promise<{ isConnected: boolean; workerName: string }>,
  onWorkerStatusChange: (callback: (status: { isConnected: boolean }) => void) => {
    ipcRenderer.on(IPC.WORKER_STATUS_CHANGE, (_event, status) => callback(status))
  },
  listClaudeSessions: () =>
    ipcRenderer.invoke(IPC.LIST_CLAUDE_SESSIONS) as Promise<
      { sessionId: string; cwd: string; updatedAt: string; size: number; summary: string }[]
    >,
  pickFolder: () => ipcRenderer.invoke(IPC.PICK_FOLDER) as Promise<string | null>
})
