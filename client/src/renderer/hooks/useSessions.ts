import { useCallback, useEffect } from 'react'
import { useStore } from '../store'
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
    const res = await api.getSessions()
    if (res.ok) {
      const data = await res.json()
      setSessions(data)
    }
  }, [setSessions])

  useEffect(() => {
    if (isAuthenticated) {
      fetchSessions()
    }
  }, [isAuthenticated, fetchSessions])

  const createSession = useCallback(
    async (name?: string, claudeSessionId?: string, workDir?: string) => {
      const res = await api.createSession(name, claudeSessionId, workDir)
      if (res.ok) {
        const session = await res.json()
        addSession(session)
        setActiveSession(session.id)
        return session
      }
    },
    [addSession, setActiveSession]
  )

  const deleteSession = useCallback(
    async (id: string) => {
      const res = await api.deleteSession(id)
      if (res.ok) {
        removeSession(id)
      }
    },
    [removeSession]
  )

  const updateSessionName = useCallback(
    async (id: string, name: string) => {
      const res = await api.renameSession(id, name)
      if (res.ok) {
        renameSession(id, name)
      }
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
