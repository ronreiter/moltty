export type ClaudeSession = {
  sessionId: string
  cwd: string
  updatedAt: string
  size: number
  summary: string
}

export type CodingTool = 'claude' | 'opencode' | 'gemini' | 'codex' | 'aider' | 'gh-copilot' | 'amp'

export type MolttySettings = {
  codingTool: CodingTool
  loadZshrc: boolean
  theme?: string
  notifications?: boolean
  autoUpdate?: boolean
}

export const CODING_TOOLS: { id: CodingTool; name: string; command: string; description: string; resumeArg?: string }[] = [
  { id: 'claude', name: 'Claude Code', command: 'claude', description: 'Anthropic', resumeArg: '--resume' },
  { id: 'opencode', name: 'OpenCode', command: 'opencode', description: 'Open source' },
  { id: 'gemini', name: 'Gemini CLI', command: 'gemini', description: 'Google', resumeArg: '--resume' },
  { id: 'codex', name: 'Codex', command: 'codex', description: 'OpenAI' },
  { id: 'aider', name: 'Aider', command: 'aider', description: 'Open source' },
  { id: 'gh-copilot', name: 'GitHub Copilot', command: 'gh copilot', description: 'GitHub' },
  { id: 'amp', name: 'Amp', command: 'amp', description: 'Sourcegraph', resumeArg: '--resume' },
]

declare global {
  interface Window {
    electronAPI: {
      loadSessions: () => Promise<any>
      saveSessions: (data: string) => Promise<void>
      loadSettings: () => Promise<MolttySettings | null>
      saveSettings: (data: string) => Promise<void>
      listClaudeSessions: () => Promise<ClaudeSession[]>
      pickFolder: () => Promise<string | null>
      openExternal: (url: string) => Promise<void>
      openPath: (filePath: string) => Promise<void>
      spawnLocalPty: (sessionId: string, command: string, workDir: string, loadZshrc?: boolean) => Promise<{ ok: boolean; reattached?: boolean; error?: string }>
      sendLocalPtyInput: (sessionId: string, data: string) => void
      resizeLocalPty: (sessionId: string, cols: number, rows: number) => void
      killLocalPty: (sessionId: string) => Promise<void>
      onLocalPtyOutput: (cb: (sessionId: string, data: string) => void) => () => void
      onLocalPtyExit: (cb: (sessionId: string, exitCode: number) => void) => () => void
      onToolSessionDetected: (cb: (sessionId: string, toolSessionId: string) => void) => () => void
      getGitBranch: (workDir: string) => Promise<string | null>
      createGitWorktree: (workDir: string) => Promise<{ ok: boolean; path?: string; branch?: string; error?: string }>
      readFile: (filePath: string) => Promise<{ ok: boolean; content?: string; isDirectory?: boolean; error?: string }>
      writeFile: (filePath: string, content: string) => Promise<{ ok: boolean; error?: string }>
      showNotification: (title: string, body: string) => void
      sendFileDrop: (text: string) => void
      setActiveSessionMain: (sessionId: string) => void
      getPathForFile: (file: File) => string
      forceQuit: () => void
      onQuitConfirm: (cb: (show: boolean) => void) => () => void
    }
  }
}
