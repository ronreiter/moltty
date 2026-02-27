import React, { useEffect, useRef, useCallback } from 'react'
import { useStore } from './store'
import Sidebar from './components/Sidebar'
import TabBar from './components/TabBar'
import Terminal, { TerminalHandle } from './components/Terminal'

export default function App() {
  const activeSessionId = useStore((s) => s.activeSessionId)
  const activeSession = useStore((s) => s.sessions.find((sess) => sess.id === s.activeSessionId))
  const openTabs = useStore((s) => s.openTabs)
  const setActiveSession = useStore((s) => s.setActiveSession)
  const terminalRefs = useRef<Map<string, TerminalHandle>>(new Map())

  // Focus terminal when active tab changes
  useEffect(() => {
    if (activeSessionId) {
      // Small delay to let visibility change take effect
      requestAnimationFrame(() => {
        terminalRefs.current.get(activeSessionId)?.focus()
      })
    }
  }, [activeSessionId])

  // Cmd+Left / Cmd+Right to switch tabs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.metaKey) return
      const tabs = useStore.getState().openTabs
      const active = useStore.getState().activeSessionId
      if (tabs.length < 2 || !active) return

      const idx = tabs.indexOf(active)
      if (idx === -1) return

      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        const prev = idx > 0 ? tabs[idx - 1] : tabs[tabs.length - 1]
        setActiveSession(prev)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        const next = idx < tabs.length - 1 ? tabs[idx + 1] : tabs[0]
        setActiveSession(next)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setActiveSession])

  const setTerminalRef = useCallback((tabId: string, handle: TerminalHandle | null) => {
    if (handle) {
      terminalRefs.current.set(tabId, handle)
    } else {
      terminalRefs.current.delete(tabId)
    }
  }, [])

  return (
    <div className="flex h-screen bg-terminal-bg">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        {/* Tab bar in the titlebar area */}
        <TabBar />

        {openTabs.length > 0 ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* CWD header */}
            {activeSession?.workDir && (
              <div className="flex-shrink-0 px-4 py-1.5 bg-terminal-surface border-b border-terminal-border">
                <span className="text-xs text-terminal-subtext font-mono">
                  {activeSession.workDir.replace(/^\/Users\/[^/]+/, '~')}
                </span>
              </div>
            )}

            {/* Terminals — one per tab, show/hide via CSS to keep PTYs alive */}
            <div className="flex-1 overflow-hidden relative">
              {openTabs.map((tabId) => (
                <div
                  key={tabId}
                  className="absolute inset-0"
                  style={{ visibility: tabId === activeSessionId ? 'visible' : 'hidden' }}
                >
                  <Terminal
                    ref={(handle) => setTerminalRef(tabId, handle)}
                    sessionId={tabId}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-terminal-subtext text-lg mb-2">No session selected</p>
              <p className="text-terminal-subtext/60 text-sm">
                Select a session from the sidebar or create a new one
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
