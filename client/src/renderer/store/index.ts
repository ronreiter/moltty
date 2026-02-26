import { create } from 'zustand'

export interface Session {
  id: string
  name: string
  status: 'creating' | 'running' | 'stopped' | 'error' | 'offline'
  sessionType?: 'worker' | 'container'
  workDir?: string
  createdAt: string
}

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
}

interface AppState extends AuthState {
  sessions: Session[]
  activeSessionId: string | null
  workerConnected: boolean

  setTokens: (accessToken: string, refreshToken: string) => void
  clearAuth: () => void
  setSessions: (sessions: Session[]) => void
  addSession: (session: Session) => void
  removeSession: (id: string) => void
  renameSession: (id: string, name: string) => void
  setActiveSession: (id: string | null) => void
  setWorkerConnected: (connected: boolean) => void
}

export const useStore = create<AppState>((set) => ({
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  sessions: [],
  activeSessionId: null,
  workerConnected: false,

  setTokens: (accessToken, refreshToken) =>
    set({ accessToken, refreshToken, isAuthenticated: true }),

  clearAuth: () =>
    set({ accessToken: null, refreshToken: null, isAuthenticated: false }),

  setSessions: (sessions) => set({ sessions }),

  addSession: (session) =>
    set((state) => ({ sessions: [session, ...state.sessions] })),

  removeSession: (id) =>
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== id),
      activeSessionId: state.activeSessionId === id ? null : state.activeSessionId
    })),

  renameSession: (id, name) =>
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, name } : s))
    })),

  setActiveSession: (id) => set({ activeSessionId: id }),

  setWorkerConnected: (connected) => set({ workerConnected: connected })
}))
