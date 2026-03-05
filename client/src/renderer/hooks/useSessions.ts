import { useCallback } from 'react'
import { useStore } from '../store'
import type { Session } from '../store'

export function useSessions() {
  const {
    sessions,
    activeSessionId,
    addSession,
    removeSession,
    renameSession,
    setActiveSession
  } = useStore()

  const createSession = useCallback(
    (name?: string, toolSessionId?: string, workDir?: string) => {
      const session: Session = {
        id: crypto.randomUUID(),
        name: name || 'New Session',
        status: 'open',
        workDir,
        toolSessionId,
        createdAt: new Date().toISOString()
      }
      addSession(session)
      setActiveSession(session.id)
      return session
    },
    [addSession, setActiveSession]
  )

  const deleteSession = useCallback(
    (id: string) => {
      removeSession(id)
    },
    [removeSession]
  )

  const updateSessionName = useCallback(
    (id: string, name: string) => {
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
