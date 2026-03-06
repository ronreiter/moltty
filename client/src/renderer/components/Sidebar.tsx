import React, { useEffect, useState } from 'react'
import { useSessions } from '../hooks/useSessions'
import { useStore } from '../store'
import SessionItem from './SessionItem'
import SettingsModal from './SettingsModal'
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
  const reopenSession = useStore((s) => s.reopenSession)
  const [claudeSessions, setClaudeSessions] = useState<ClaudeSession[]>([])
  const [tab, setTab] = useState<Tab>('sessions')
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

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
    try {
      const folder = await window.electronAPI.pickFolder()
      if (folder) {
        createSession(shortPath(folder), undefined, folder)
      } else {
        createSession('New Session', undefined, '~')
      }
    } catch {
      createSession('New Session', undefined, '~')
    }
  }

  const openSessions = sessions.filter((s) => s.status === 'open')
  const closedSessions = sessions.filter((s) => s.status === 'closed')

  return (
    <div className="w-64 h-full bg-terminal-surface flex flex-col border-r border-terminal-border">
      {/* Titlebar drag area */}
      <div className="titlebar-drag h-10 flex items-center pl-20 pr-4 flex-shrink-0">
        <span className="titlebar-no-drag text-sm font-semibold text-terminal-accent">Moltty</span>
      </div>

      {/* New session button */}
      <div className="px-3 pb-2">
        <button
          onClick={newSessionWithFolder}
          className="w-full py-2 text-sm text-terminal-accent rounded-lg border border-terminal-accent/50 hover:border-terminal-accent transition-colors"
          style={{ backgroundColor: 'color-mix(in srgb, var(--terminal-accent) 15%, transparent)' }}
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
          {openSessions.map((session) => (
            <SessionItem
              key={session.id}
              session={session}
              isActive={session.id === activeSessionId}
              onClick={() => setActiveSession(session.id)}
              onRename={(name) => updateSessionName(session.id, name)}
              onDelete={() => deleteSession(session.id)}
            />
          ))}
          {closedSessions.length > 0 && openSessions.length > 0 && (
            <div className="border-t border-terminal-border my-1" />
          )}
          {closedSessions.map((session) => (
            <SessionItem
              key={session.id}
              session={session}
              isActive={session.id === activeSessionId}
              onClick={() => reopenSession(session.id)}
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
            <p className="text-terminal-subtext text-xs text-center mt-4">No sessions found</p>
          )}
        </div>
      )}

      {/* Settings button */}
      <div className="flex-shrink-0 px-3 py-3 border-t border-terminal-border">
        <button
          onClick={() => setShowSettings(true)}
          className="flex items-center gap-2 text-sm text-terminal-subtext hover:text-terminal-text transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Settings
        </button>
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  )
}
