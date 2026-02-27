import { useCallback, useEffect } from 'react'
import { useStore } from '../store'
import type { Session } from '../store'
import { api } from '../services/api'

export function useSessions() {
  const {
    sessions,
    activeSessionId,
    isAuthenticated,
    setSessions,
    addSession,
    removeSession,
    renameSession,
    setActiveSession
  } = useStore()

  const fetchSessions = useCallback(async () => {
    try {
      const res = await api.getSessions()
      if (res.ok) {
        const data: Session[] = await res.json()
        // Preserve local-only (offline) sessions that don't exist on server
        const localSessions = useStore.getState().sessions.filter((s) => s.status === 'offline')
        const merged = [...data, ...localSessions]
        setSessions(merged)
      }
    } catch {
      // Server unavailable
    }
  }, [setSessions])

  useEffect(() => {
    if (isAuthenticated) {
      fetchSessions()
      const interval = setInterval(fetchSessions, 3000)
      return () => clearInterval(interval)
    }
  }, [isAuthenticated, fetchSessions])

  const createSession = useCallback(
    async (name?: string, claudeSessionId?: string, workDir?: string) => {
      try {
        const res = await api.createSession(name, claudeSessionId, workDir)
        if (res.ok) {
          const session = await res.json()
          addSession(session)
          setActiveSession(session.id)
          return session
        }
      } catch {
        // Server unavailable — create a local-only session
      }
      const localSession = {
        id: crypto.randomUUID(),
        name: name || 'New Session',
        status: 'offline' as const,
        sessionType: 'container' as const,
        workDir,
        claudeSessionId,
        createdAt: new Date().toISOString()
      }
      addSession(localSession)
      setActiveSession(localSession.id)
      return localSession
    },
    [addSession, setActiveSession]
  )

  const deleteSession = useCallback(
    async (id: string) => {
      try {
        const res = await api.deleteSession(id)
        if (res.ok) {
          removeSession(id)
          return
        }
      } catch {
        // Server unavailable — remove locally
      }
      removeSession(id)
    },
    [removeSession]
  )

  const updateSessionName = useCallback(
    async (id: string, name: string) => {
      try {
        const res = await api.renameSession(id, name)
        if (res.ok) {
          renameSession(id, name)
          return
        }
      } catch {
        // Server unavailable — rename locally
      }
      renameSession(id, name)
    },
    [renameSession]
  )

  return {
    sessions,
    activeSessionId,
    createSession,
    deleteSession,
    updateSessionName,
    setActiveSession
  }
}
