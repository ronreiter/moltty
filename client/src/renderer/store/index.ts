import { create } from 'zustand'

export interface Session {
  id: string
  name: string
  status: 'creating' | 'running' | 'stopped' | 'error' | 'offline'
  sessionType?: 'worker' | 'container'
  workDir?: string
  claudeSessionId?: string
  createdAt: string
}

const LOCAL_SESSIONS_KEY = 'moltty:local-sessions'

function loadLocalSessions(): { sessions: Session[]; openTabs: string[]; activeSessionId: string | null } {
  try {
    const raw = localStorage.getItem(LOCAL_SESSIONS_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return { sessions: [], openTabs: [], activeSessionId: null }
}

function saveLocalSessions(sessions: Session[], openTabs: string[], activeSessionId: string | null): void {
  const localSessions = sessions.filter((s) => s.status === 'offline')
  const localTabs = openTabs.filter((t) => localSessions.some((s) => s.id === t))
  const localActive = localSessions.some((s) => s.id === activeSessionId) ? activeSessionId : null
  try {
    localStorage.setItem(LOCAL_SESSIONS_KEY, JSON.stringify({ sessions: localSessions, openTabs: localTabs, activeSessionId: localActive }))
  } catch {}
}

const restored = loadLocalSessions()

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
}

interface AppState extends AuthState {
  sessions: Session[]
  activeSessionId: string | null
  openTabs: string[]
  loadedSessionIds: Set<string>
  workerConnected: boolean

  setTokens: (accessToken: string, refreshToken: string) => void
  clearAuth: () => void
  setSessions: (sessions: Session[]) => void
  addSession: (session: Session) => void
  removeSession: (id: string) => void
  renameSession: (id: string, name: string) => void
  setActiveSession: (id: string | null) => void
  openTab: (id: string) => void
  closeTab: (id: string) => void
  reorderTabs: (fromIndex: number, toIndex: number) => void
  setWorkerConnected: (connected: boolean) => void
  markSessionLoaded: (id: string) => void
  markSessionUnloaded: (id: string) => void
}

export const useStore = create<AppState>((set) => ({
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  sessions: restored.sessions,
  activeSessionId: restored.activeSessionId,
  openTabs: restored.openTabs,
  loadedSessionIds: new Set<string>(),
  workerConnected: false,

  setTokens: (accessToken, refreshToken) =>
    set({ accessToken, refreshToken, isAuthenticated: true }),

  clearAuth: () =>
    set({ accessToken: null, refreshToken: null, isAuthenticated: false }),

  setSessions: (sessions) => set({ sessions }),

  addSession: (session) =>
    set((state) => ({
      sessions: [session, ...state.sessions],
      openTabs: [...state.openTabs, session.id],
      activeSessionId: session.id
    })),

  removeSession: (id) =>
    set((state) => {
      const openTabs = state.openTabs.filter((t) => t !== id)
      let activeSessionId = state.activeSessionId
      if (activeSessionId === id) {
        activeSessionId = openTabs.length > 0 ? openTabs[openTabs.length - 1] : null
      }
      return {
        sessions: state.sessions.filter((s) => s.id !== id),
        openTabs,
        activeSessionId
      }
    }),

  renameSession: (id, name) =>
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, name } : s))
    })),

  setActiveSession: (id) =>
    set((state) => ({
      activeSessionId: id,
      openTabs: id && !state.openTabs.includes(id) ? [...state.openTabs, id] : state.openTabs
    })),

  openTab: (id) =>
    set((state) => ({
      activeSessionId: id,
      openTabs: state.openTabs.includes(id) ? state.openTabs : [...state.openTabs, id]
    })),

  closeTab: (id) =>
    set((state) => {
      const openTabs = state.openTabs.filter((t) => t !== id)
      let activeSessionId = state.activeSessionId
      if (activeSessionId === id) {
        const idx = state.openTabs.indexOf(id)
        activeSessionId =
          openTabs.length > 0 ? openTabs[Math.min(idx, openTabs.length - 1)] : null
      }
      return { openTabs, activeSessionId }
    }),

  reorderTabs: (fromIndex, toIndex) =>
    set((state) => {
      const tabs = [...state.openTabs]
      const [moved] = tabs.splice(fromIndex, 1)
      tabs.splice(toIndex, 0, moved)
      return { openTabs: tabs }
    }),

  setWorkerConnected: (connected) => set({ workerConnected: connected }),

  markSessionLoaded: (id) =>
    set((state) => {
      const next = new Set(state.loadedSessionIds)
      next.add(id)
      return { loadedSessionIds: next }
    }),

  markSessionUnloaded: (id) =>
    set((state) => {
      const next = new Set(state.loadedSessionIds)
      next.delete(id)
      return { loadedSessionIds: next }
    })
}))

// Persist local sessions to localStorage on every state change
useStore.subscribe((state) => {
  saveLocalSessions(state.sessions, state.openTabs, state.activeSessionId)
})
