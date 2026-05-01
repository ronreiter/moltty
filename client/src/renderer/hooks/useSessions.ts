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
    (
      name?: string,
      toolSessionId?: string,
      workDir?: string,
      opts?: { skipPermissions?: boolean; displayDir?: string; useWorktree?: boolean }
    ) => {
      const session: Session = {
        id: crypto.randomUUID(),
        name: name || 'New Session',
        status: 'open',
        workDir,
        displayDir: opts?.displayDir,
        toolSessionId,
        skipPermissions: opts?.skipPermissions,
        useWorktree: opts?.useWorktree,
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
