import React, { useEffect, useState } from 'react'
import { useSessions } from '../hooks/useSessions'
import { useAuth } from '../hooks/useAuth'
import SessionItem from './SessionItem'
import WorkerStatus from './WorkerStatus'
import type { ClaudeSession } from '../services/api'

function shortPath(cwd: string): string {
  const home = '/Users/'
  if (cwd.startsWith(home)) {
    const afterHome = cwd.slice(home.length)
    const slash = afterHome.indexOf('/')
    if (slash !== -1) {
      return '~' + afterHome.slice(slash)
    }
    return '~'
  }
  return cwd
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

type Tab = 'sessions' | 'history'

export default function Sidebar() {
  const { sessions, activeSessionId, createSession, deleteSession, updateSessionName, setActiveSession } =
    useSessions()
  const { isAuthenticated, logout } = useAuth()
  const [claudeSessions, setClaudeSessions] = useState<ClaudeSession[]>([])
  const [tab, setTab] = useState<Tab>('sessions')
  const [loadingHistory, setLoadingHistory] = useState(false)

  useEffect(() => {
    if (tab === 'history') {
      setLoadingHistory(true)
      window.electronAPI.listClaudeSessions().then((sessions) => {
        setClaudeSessions(sessions)
        setLoadingHistory(false)
      })
    }
  }, [tab])

  const resumeClaudeSession = (cs: ClaudeSession) => {
    const name = shortPath(cs.cwd)
    createSession(name, cs.sessionId, cs.cwd)
    setTab('sessions')
  }

  const newSessionWithFolder = async () => {
    const folder = await window.electronAPI.pickFolder()
    if (folder) {
      createSession(shortPath(folder), undefined, folder)
    }
  }

  return (
    <div className="w-64 h-full bg-terminal-surface flex flex-col border-r border-terminal-border">
      {/* Titlebar drag area */}
      <div className="titlebar-drag h-10 flex items-center pl-20 pr-4 flex-shrink-0">
        <span className="titlebar-no-drag text-sm font-semibold text-terminal-accent">Moltty</span>
      </div>

      {/* Worker status — only show when authenticated */}
      {isAuthenticated && <WorkerStatus />}

      {/* New session button */}
      <div className="px-3 pb-2">
        <button
          onClick={newSessionWithFolder}
          className="w-full py-2 text-sm bg-terminal-accent/20 text-terminal-accent rounded-lg hover:bg-terminal-accent/30 transition-colors"
        >
          + New Session
        </button>
      </div>

      {/* Tabs */}
      <div className="flex mx-3 mb-2 bg-terminal-bg rounded-lg p-0.5">
        <button
          onClick={() => setTab('sessions')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
            tab === 'sessions'
              ? 'bg-terminal-surface text-terminal-accent shadow-sm'
              : 'text-terminal-subtext hover:text-terminal-text'
          }`}
        >
          Sessions
        </button>
        <button
          onClick={() => setTab('history')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
            tab === 'history'
              ? 'bg-terminal-surface text-terminal-accent shadow-sm'
              : 'text-terminal-subtext hover:text-terminal-text'
          }`}
        >
          History
        </button>
      </div>

      {/* Tab content */}
      {tab === 'sessions' && (
        <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
          {sessions.map((session) => (
            <SessionItem
              key={session.id}
              session={session}
              isActive={session.id === activeSessionId}
              onClick={() => setActiveSession(session.id)}
              onRename={(name) => updateSessionName(session.id, name)}
              onDelete={() => deleteSession(session.id)}
            />
          ))}
          {sessions.length === 0 && (
            <p className="text-terminal-subtext text-xs text-center mt-8 px-4">
              No sessions yet. Create one or pick from History.
            </p>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
          {loadingHistory && (
            <div className="flex items-center justify-center py-8">
              <div className="w-4 h-4 border-2 border-terminal-accent/30 border-t-terminal-accent rounded-full animate-spin" />
            </div>
          )}
          {!loadingHistory &&
            claudeSessions.map((cs) => (
              <div
                key={cs.sessionId}
                onClick={() => resumeClaudeSession(cs)}
                className="flex flex-col gap-0.5 px-3 py-2 rounded-lg cursor-pointer hover:bg-terminal-bg text-terminal-text transition-colors"
              >
                <span className="text-xs font-medium truncate">{shortPath(cs.cwd)}</span>
                {cs.summary && (
                  <span className="text-[11px] text-terminal-text/60 truncate">{cs.summary}</span>
                )}
                <div className="flex gap-2 text-[10px] text-terminal-subtext">
                  <span>{timeAgo(cs.updatedAt)}</span>
                  <span>{formatSize(cs.size)}</span>
                </div>
              </div>
            ))}
          {!loadingHistory && claudeSessions.length === 0 && (
            <p className="text-terminal-subtext text-xs text-center mt-4">No Claude sessions found</p>
          )}
        </div>
      )}

      {/* Footer — sign out if authenticated, otherwise just spacer */}
      {isAuthenticated && (
        <div className="p-3 border-t border-terminal-border">
          <button
            onClick={logout}
            className="w-full py-2 text-sm text-terminal-subtext hover:text-terminal-red rounded-lg hover:bg-terminal-bg transition-colors"
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  )
}
