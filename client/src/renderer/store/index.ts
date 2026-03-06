import { create } from 'zustand'
import type { MolttySettings } from '../services/api'

export interface Session {
  id: string
  name: string
  status: 'open' | 'closed'
  workDir?: string
  toolSessionId?: string
  createdAt: string
}

type SessionData = { sessions: Session[]; openTabs: string[]; activeSessionId: string | null }

function migrateData(data: SessionData): SessionData {
  // Migrate old status values and reopen sessions that had tabs open
  const openTabSet = new Set(data.openTabs || [])
  data.sessions = (data.sessions || []).map((s: Session & { status: string; claudeSessionId?: string }) => {
    // Migrate claudeSessionId → toolSessionId
    const toolSessionId = s.toolSessionId || s.claudeSessionId
    const { claudeSessionId: _, ...rest } = s as any
    return {
      ...rest,
      toolSessionId,
      status: openTabSet.has(s.id) ? ('open' as const) : ('closed' as const)
    }
  })
  return data
}

function saveSessions(sessions: Session[], openTabs: string[], activeSessionId: string | null): void {
  if (window.electronAPI?.saveSessions) {
    window.electronAPI.saveSessions(JSON.stringify({ sessions, openTabs, activeSessionId }))
  }
}

interface AppState {
  sessions: Session[]
  activeSessionId: string | null
  openTabs: string[]
  loadedSessionIds: Set<string>
  activeTabIds: Set<string>
  hydrated: boolean
  settings: MolttySettings | null
  settingsLoaded: boolean
  fontSize: number

  hydrate: () => Promise<void>
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
  setToolSessionId: (id: string, toolSessionId: string) => void
  markTabActivity: (id: string) => void
  clearTabActivity: (id: string) => void
  reopenSession: (id: string) => void
  setSettings: (settings: MolttySettings) => void
  setFontSize: (size: number) => void
}

export const useStore = create<AppState>((set) => ({
  sessions: [],
  activeSessionId: null,
  openTabs: [],
  loadedSessionIds: new Set<string>(),
  activeTabIds: new Set<string>(),
  hydrated: false,
  settings: null,
  settingsLoaded: false,
  fontSize: 14,

  hydrate: async () => {
    try {
      const [data, settings] = await Promise.all([
        window.electronAPI.loadSessions(),
        window.electronAPI.loadSettings()
      ])
      if (data) {
        const migrated = migrateData(data)
        set({
          sessions: migrated.sessions,
          openTabs: migrated.openTabs || [],
          activeSessionId: migrated.activeSessionId || null,
          hydrated: true,
          settings,
          settingsLoaded: true
        })
        return
      }
      set({ hydrated: true, settings, settingsLoaded: true })
      return
    } catch {
      // electronAPI not available (e.g. in browser tests)
    }
    set({ hydrated: true, settingsLoaded: true })
  },

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

  setToolSessionId: (id, toolSessionId) =>
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, toolSessionId } : s))
    })),

  markTabActivity: (id) =>
    set((state) => {
      if (state.activeSessionId === id) return state
      const next = new Set(state.activeTabIds)
      next.add(id)
      return { activeTabIds: next }
    }),

  clearTabActivity: (id) =>
    set((state) => {
      if (!state.activeTabIds.has(id)) return state
      const next = new Set(state.activeTabIds)
      next.delete(id)
      return { activeTabIds: next }
    }),

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
        toolSessionId: old.toolSessionId,
        createdAt: new Date().toISOString()
      }
      return {
        sessions: [newSession, ...state.sessions.filter((s) => s.id !== id)],
        openTabs: [...state.openTabs, newId],
        activeSessionId: newId
      }
    }),

  setSettings: (settings) => {
    set({ settings })
    window.electronAPI?.saveSettings(JSON.stringify(settings))
  },

  setFontSize: (size) => set({ fontSize: Math.max(8, Math.min(24, size)) })
}))

// Save to main process on every state change (skip until hydrated)
useStore.subscribe((state) => {
  if (state.hydrated) {
    saveSessions(state.sessions, state.openTabs, state.activeSessionId)
  }
})
