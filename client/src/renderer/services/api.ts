const API_BASE = 'http://localhost:8082/api'

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
      getToken: () => Promise<{ accessToken: string; refreshToken: string } | null>
      setToken: (tokens: { accessToken: string; refreshToken: string }) => Promise<void>
      clearToken: () => Promise<void>
      onOAuthCallback: (cb: (tokens: { accessToken: string; refreshToken: string }) => void) => void
      getWorkerStatus: () => Promise<{ isConnected: boolean; workerName: string }>
      onWorkerStatusChange: (cb: (status: { isConnected: boolean }) => void) => void
      listClaudeSessions: () => Promise<ClaudeSession[]>
      pickFolder: () => Promise<string | null>
    }
  }
}

async function getAccessToken(): Promise<string | null> {
  const tokens = await window.electronAPI.getToken()
  return tokens?.accessToken ?? null
}

async function request(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>)
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })

  if (res.status === 401) {
    // Try refresh
    const tokens = await window.electronAPI.getToken()
    if (tokens?.refreshToken) {
      const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: tokens.refreshToken })
      })
      if (refreshRes.ok) {
        const newTokens = await refreshRes.json()
        await window.electronAPI.setToken(newTokens)
        headers['Authorization'] = `Bearer ${newTokens.accessToken}`
        return fetch(`${API_BASE}${path}`, { ...options, headers })
      }
    }
    await window.electronAPI.clearToken()
  }

  return res
}

export const api = {
  register: (email: string, password: string, name: string) =>
    fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name })
    }),

  login: (email: string, password: string) =>
    fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    }),

  getSessions: () => request('/sessions'),

  createSession: (name?: string, claudeSessionId?: string, workDir?: string) =>
    request('/sessions', {
      method: 'POST',
      body: JSON.stringify({
        name: name || 'New Session',
        ...(claudeSessionId ? { claudeSessionId } : {}),
        ...(workDir ? { workDir } : {})
      })
    }),

  renameSession: (id: string, name: string) =>
    request(`/sessions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name })
    }),

  deleteSession: (id: string) =>
    request(`/sessions/${id}`, { method: 'DELETE' }),

  getTerminalWSUrl: async (sessionId: string): Promise<string> => {
    const res = await request('/sessions')
    if (!res.ok) {
      throw new Error('Failed to refresh token for terminal connection')
    }
    const token = await getAccessToken()
    return `ws://localhost:8082/api/sessions/${sessionId}/terminal?token=${token}`
  }
}
