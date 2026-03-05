export type ClaudeSession = {
  sessionId: string
  cwd: string
  updatedAt: string
  size: number
  summary: string
}

declare global {
  interface Window {
    electronAPI: {
      loadSessions: () => Promise<any>
      saveSessions: (data: string) => Promise<void>
      listClaudeSessions: () => Promise<ClaudeSession[]>
      pickFolder: () => Promise<string | null>
      openExternal: (url: string) => Promise<void>
      spawnLocalPty: (sessionId: string, command: string, workDir: string) => Promise<{ ok: boolean; reattached?: boolean; error?: string }>
      sendLocalPtyInput: (sessionId: string, data: string) => void
      resizeLocalPty: (sessionId: string, cols: number, rows: number) => void
      killLocalPty: (sessionId: string) => Promise<void>
      onLocalPtyOutput: (cb: (sessionId: string, data: string) => void) => () => void
      onLocalPtyExit: (cb: (sessionId: string, exitCode: number) => void) => () => void
      onClaudeSessionDetected: (cb: (sessionId: string, claudeSessionId: string) => void) => () => void
    }
  }
}
