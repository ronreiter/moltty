import { create } from 'zustand'

export interface Session {
  id: string
  name: string
  status: 'open' | 'closed'
  workDir?: string
  claudeSessionId?: string
  createdAt: string
}

const LOCAL_SESSIONS_KEY = 'moltty:local-sessions'

function loadLocalSessions(): { sessions: Session[]; openTabs: string[]; activeSessionId: string | null } {
  try {
    const raw = localStorage.getItem(LOCAL_SESSIONS_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      // Migrate old status values — anything that isn't 'closed' becomes 'open'
      data.sessions = (data.sessions || []).map((s: Session & { status: string }) => ({
        ...s,
        status: s.status === 'closed' ? 'closed' : 'open'
      }))
      return data
    }
  } catch {}
  return { sessions: [], openTabs: [], activeSessionId: null }
}

function saveLocalSessions(sessions: Session[], openTabs: string[], activeSessionId: string | null): void {
  try {
    localStorage.setItem(LOCAL_SESSIONS_KEY, JSON.stringify({ sessions, openTabs, activeSessionId }))
  } catch {}
}

const restored = loadLocalSessions()
// Sessions with open tabs get reopened (new PTY will spawn), others are closed
const openTabSet = new Set(restored.openTabs)
restored.sessions = restored.sessions.map((s) => ({
  ...s,
  status: openTabSet.has(s.id) ? ('open' as const) : ('closed' as const)
}))

interface AppState {
  sessions: Session[]
  activeSessionId: string | null
  openTabs: string[]
  loadedSessionIds: Set<string>

  setSessions: (sessions: Session[]) => void
  addSession: (session: Session) => void
  removeSession: (id: string) => void
  renameSession: (id: string, name: string) => void
  setActiveSession: (id: string | null) => void
  openTab: (id: string) => void
  closeTab: (id: string) => void
  reorderTabs: (fromIndex: number, toIndex: number) => void
  markSessionLoaded: (id: string) => void
  markSessionUnloaded: (id: string) => void
  markSessionClosed: (id: string) => void
  reopenSession: (id: string) => void
}

export const useStore = create<AppState>((set) => ({
  sessions: restored.sessions,
  activeSessionId: restored.activeSessionId,
  openTabs: restored.openTabs,
  loadedSessionIds: new Set<string>(),

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
    }),

  markSessionClosed: (id) =>
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, status: 'closed' as const } : s))
    })),

  reopenSession: (id) =>
    set((state) => {
      const old = state.sessions.find((s) => s.id === id)
      if (!old) return state
      const newId = crypto.randomUUID()
      const newSession: Session = {
        id: newId,
        name: old.name,
        status: 'open',
        workDir: old.workDir,
        claudeSessionId: old.claudeSessionId,
        createdAt: new Date().toISOString()
      }
      return {
        sessions: [newSession, ...state.sessions.filter((s) => s.id !== id)],
        openTabs: [...state.openTabs, newId],
        activeSessionId: newId
      }
    })
}))

useStore.subscribe((state) => {
  saveLocalSessions(state.sessions, state.openTabs, state.activeSessionId)
})
