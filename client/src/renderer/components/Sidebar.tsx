import React, { useEffect, useState } from 'react'
import { useSessions } from '../hooks/useSessions'
import { useStore, COLOR_LABELS, ColorLabel, Session } from '../store'
import SessionItem from './SessionItem'
import FolderItem from './FolderItem'
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
  const activeTabIds = useStore((s) => s.activeTabIds)
  const lastFinishedAt = useStore((s) => s.lastFinishedAt)
  const folders = useStore((s) => s.folders)
  const addFolder = useStore((s) => s.addFolder)
  const setSessionFolder = useStore((s) => s.setSessionFolder)
  const [claudeSessions, setClaudeSessions] = useState<ClaudeSession[]>([])
  const [tab, setTab] = useState<Tab>('sessions')
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [useWorktree, setUseWorktree] = useState(false)
  const [skipPermissions, setSkipPermissions] = useState(false)
  const [search, setSearch] = useState('')
  const [unassignedDragOver, setUnassignedDragOver] = useState(false)

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
      if (!folder) return
      let workDir = folder
      let name = shortPath(folder)
      let displayDir: string | undefined
      if (useWorktree) {
        const result = await window.electronAPI.createGitWorktree(folder)
        if (result.ok && result.path) {
          workDir = result.path
          displayDir = folder
          name = `${shortPath(folder)} [${result.branch}]`
        }
      }
      createSession(name, undefined, workDir, { skipPermissions, displayDir })
    } catch {
      // dialog failed, do nothing
    }
  }

  const lowerSearch = search.toLowerCase()
  const matchSession = (s: { name?: string; workDir?: string }) =>
    !search || s.name?.toLowerCase().includes(lowerSearch) || s.workDir?.toLowerCase().includes(lowerSearch)

  const sortKey = (s: { id: string; createdAt: string }) =>
    lastFinishedAt[s.id] ?? new Date(s.createdAt).getTime()
  const sortBySession = (a: { id: string; createdAt: string }, b: { id: string; createdAt: string }) => {
    const aBlue = activeTabIds.has(a.id)
    const bBlue = activeTabIds.has(b.id)
    if (aBlue !== bBlue) return aBlue ? -1 : 1
    return sortKey(b) - sortKey(a)
  }
  const openSessions = sessions.filter((s) => s.status === 'open' && matchSession(s)).sort(sortBySession)
  const closedSessions = sessions.filter((s) => s.status === 'closed' && matchSession(s)).sort(sortBySession)

  const groupOrder: (ColorLabel | undefined)[] = [...COLOR_LABELS, undefined]
  const groupSessions = (list: Session[]): Array<{ color: ColorLabel | undefined; items: Session[] }> =>
    groupOrder
      .map((color) => ({ color, items: list.filter((s) => s.colorLabel === color) }))
      .filter((g) => g.items.length > 0)

  return (
    <div className="w-72 h-full bg-terminal-surface flex flex-col border-r border-terminal-border">
      {/* Titlebar drag area */}
      <div className="titlebar-drag h-10 flex items-center pl-20 pr-4 flex-shrink-0">
        <span className="titlebar-no-drag text-sm font-semibold text-terminal-accent">Moltty{location.port ? ' (Dev)' : ''}</span>
      </div>

      {/* New session button */}
      <div className="px-3 pb-2 flex flex-col gap-1.5">
        <button
          onClick={newSessionWithFolder}
          className="w-full py-2 text-sm text-terminal-accent rounded-lg border border-terminal-accent/50 hover:border-terminal-accent transition-colors"
          style={{ backgroundColor: 'color-mix(in srgb, var(--terminal-accent) 15%, transparent)' }}
        >
          + New Session
        </button>
        <label className="flex items-center gap-2 px-1 cursor-pointer">
          <input
            type="checkbox"
            checked={useWorktree}
            onChange={(e) => setUseWorktree(e.target.checked)}
            className="w-3 h-3 rounded accent-terminal-accent"
          />
          <span className="text-xs text-terminal-subtext">Git worktree</span>
        </label>
        <label className="flex items-center gap-2 px-1 cursor-pointer">
          <input
            type="checkbox"
            checked={skipPermissions}
            onChange={(e) => setSkipPermissions(e.target.checked)}
            className="w-3 h-3 rounded accent-terminal-accent"
          />
          <span className="text-xs text-terminal-subtext">Auto mode</span>
        </label>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search sessions..."
          className="w-full px-2.5 py-1.5 text-xs bg-terminal-bg text-terminal-text rounded-lg border border-terminal-border outline-none focus:border-terminal-accent placeholder:text-terminal-subtext/50"
        />
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

      {/* New folder button (sessions tab only) */}
      {tab === 'sessions' && (
        <div className="px-3 pb-2">
          <button
            onClick={() => addFolder('New Folder')}
            className="w-full py-1.5 text-xs text-terminal-subtext hover:text-terminal-text rounded-lg border border-terminal-border hover:border-terminal-subtext transition-colors"
          >
            + New Folder
          </button>
        </div>
      )}

      {/* Tab content */}
      {tab === 'sessions' && (
        <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
          {/* Folders */}
          {folders.map((folder) => {
            const folderOpen = openSessions.filter((s) => s.folderId === folder.id)
            const folderClosed = closedSessions.filter((s) => s.folderId === folder.id)
            return (
              <React.Fragment key={folder.id}>
                <FolderItem
                  folder={folder}
                  onDropSession={(sessionId) => setSessionFolder(sessionId, folder.id)}
                />
                {folder.expanded && (
                  <div className="ml-3 space-y-0.5">
                    {groupSessions(folderOpen).flatMap(({ items }) =>
                      items.map((session) => (
                        <SessionItem
                          key={session.id}
                          session={session}
                          isActive={session.id === activeSessionId}
                          onClick={() => setActiveSession(session.id)}
                          onRename={(name) => updateSessionName(session.id, name)}
                          onDelete={() => deleteSession(session.id)}
                        />
                      ))
                    )}
                    {groupSessions(folderClosed).flatMap(({ items }) =>
                      items.map((session) => (
                        <SessionItem
                          key={session.id}
                          session={session}
                          isActive={session.id === activeSessionId}
                          onClick={() => reopenSession(session.id)}
                          onRename={(name) => updateSessionName(session.id, name)}
                          onDelete={() => deleteSession(session.id)}
                        />
                      ))
                    )}
                  </div>
                )}
              </React.Fragment>
            )
          })}

          {/* Unassigned drop zone + sessions */}
          <div
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              setUnassignedDragOver(true)
            }}
            onDragLeave={() => setUnassignedDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setUnassignedDragOver(false)
              const sessionId = e.dataTransfer.getData('application/x-session-id')
              if (sessionId) setSessionFolder(sessionId, undefined)
            }}
            className={`mt-1 rounded-lg transition-colors ${
              unassignedDragOver ? 'bg-terminal-accent/10 ring-1 ring-terminal-accent' : ''
            }`}
          >
            {groupSessions(openSessions.filter((s) => !s.folderId)).flatMap(({ items }) =>
              items.map((session) => (
                <SessionItem
                  key={session.id}
                  session={session}
                  isActive={session.id === activeSessionId}
                  onClick={() => setActiveSession(session.id)}
                  onRename={(name) => updateSessionName(session.id, name)}
                  onDelete={() => deleteSession(session.id)}
                />
              ))
            )}
            {closedSessions.filter((s) => !s.folderId).length > 0 &&
              openSessions.filter((s) => !s.folderId).length > 0 && (
                <div className="border-t border-terminal-border my-1" />
              )}
            {groupSessions(closedSessions.filter((s) => !s.folderId)).flatMap(({ items }) =>
              items.map((session) => (
                <SessionItem
                  key={session.id}
                  session={session}
                  isActive={session.id === activeSessionId}
                  onClick={() => reopenSession(session.id)}
                  onRename={(name) => updateSessionName(session.id, name)}
                  onDelete={() => deleteSession(session.id)}
                />
              ))
            )}
            {/* Hint area when nothing else fills the unassigned region */}
            {sessions.filter((s) => !s.folderId).length === 0 && folders.length > 0 && (
              <div className="text-[10px] text-terminal-subtext/60 text-center py-2 px-2">
                Drop here to remove from folder
              </div>
            )}
          </div>

          {sessions.length === 0 && folders.length === 0 && (
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
            claudeSessions.filter((cs) => !search || cs.cwd.toLowerCase().includes(lowerSearch) || cs.summary?.toLowerCase().includes(lowerSearch)).map((cs) => (
              <div
                key={cs.sessionId}
                onClick={() => resumeClaudeSession(cs)}
                className="flex flex-col gap-0.5 px-3 py-2 rounded-lg cursor-pointer hover:bg-terminal-bg text-terminal-text transition-colors"
              >
                <span className="text-xs font-medium truncate">{shortPath(cs.cwd)}</span>
                {cs.summary && (
                  <span className="text-[11px] text-terminal-text/60 truncate">{cs.summary}</span>
                )}
                <div className="flex gap-2 text-xs text-terminal-subtext">
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
