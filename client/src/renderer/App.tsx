import React, { useEffect, useRef, useCallback, useState } from 'react'
import { useStore } from './store'
import Sidebar from './components/Sidebar'
import TabBar from './components/TabBar'
import Terminal, { TerminalHandle } from './components/Terminal'
import Onboarding from './components/Onboarding'
import { getTheme, type ThemeId } from './services/themes'

export default function App() {
  const activeSessionId = useStore((s) => s.activeSessionId)
  const activeSession = useStore((s) => s.sessions.find((sess) => sess.id === s.activeSessionId))
  const openTabs = useStore((s) => s.openTabs)
  const setActiveSession = useStore((s) => s.setActiveSession)
  const hydrated = useStore((s) => s.hydrated)
  const hydrate = useStore((s) => s.hydrate)
  const settings = useStore((s) => s.settings)
  const settingsLoaded = useStore((s) => s.settingsLoaded)
  const terminalRefs = useRef<Map<string, TerminalHandle>>(new Map())
  const [updateInfo, setUpdateInfo] = useState<{ version: string; notes: string; dmgUrl: string } | null>(null)

  // Hydrate store from main process on mount
  useEffect(() => {
    hydrate()
  }, [hydrate])

  // Check for updates on mount
  useEffect(() => {
    fetch('https://api.github.com/repos/ronreiter/moltty/releases/latest')
      .then((r) => r.json())
      .then((d) => {
        if (!d.tag_name) return
        const latest = d.tag_name.replace(/^v/, '')
        const current = __APP_VERSION__
        if (latest !== current) {
          const dmg = d.assets?.find((a: { name: string }) => a.name.endsWith('.dmg'))
          setUpdateInfo({
            version: latest,
            notes: d.body || '',
            dmgUrl: dmg?.browser_download_url || d.html_url
          })
        }
      })
      .catch(() => {})
  }, [])

  // Apply theme CSS variables
  useEffect(() => {
    const themeId = (settings?.theme || 'dark1') as ThemeId
    const theme = getTheme(themeId)
    const root = document.documentElement
    root.style.setProperty('--terminal-bg', theme.ui.bg)
    root.style.setProperty('--terminal-surface', theme.ui.surface)
    root.style.setProperty('--terminal-text', theme.ui.text)
    root.style.setProperty('--terminal-subtext', theme.ui.subtext)
    root.style.setProperty('--terminal-accent', theme.ui.accent)
    root.style.setProperty('--terminal-green', theme.ui.green)
    root.style.setProperty('--terminal-red', theme.ui.red)
    root.style.setProperty('--terminal-border', theme.ui.border)
  }, [settings?.theme])

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

  if (!hydrated || !settingsLoaded) {
    return (
      <div className="flex h-screen bg-terminal-bg items-center justify-center">
        <div className="w-5 h-5 border-2 border-terminal-accent/30 border-t-terminal-accent rounded-full animate-spin" />
      </div>
    )
  }

  if (!settings) {
    return <Onboarding />
  }

  return (
    <div className="flex h-screen bg-terminal-bg">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        {/* Tab bar in the titlebar area */}
        <TabBar />

        {updateInfo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setUpdateInfo(null)}>
            <div
              className="w-[480px] max-h-[80vh] bg-terminal-bg border border-terminal-border rounded-xl p-6 flex flex-col gap-4 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-terminal-text">Moltty v{updateInfo.version} Available</h2>
                <button onClick={() => setUpdateInfo(null)} className="text-terminal-subtext hover:text-terminal-text text-lg leading-none">
                  ×
                </button>
              </div>
              {updateInfo.notes && (
                <div className="overflow-y-auto max-h-[40vh] text-sm text-terminal-subtext whitespace-pre-wrap leading-relaxed border border-terminal-border rounded-lg p-4 bg-terminal-surface">
                  {updateInfo.notes}
                </div>
              )}
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setUpdateInfo(null)}
                  className="px-4 py-2 text-sm text-terminal-subtext hover:text-terminal-text transition-colors"
                >
                  Later
                </button>
                <button
                  onClick={() => {
                    window.electronAPI.openExternal(updateInfo.dmgUrl)
                    setUpdateInfo(null)
                  }}
                  className="px-4 py-2 text-sm font-semibold bg-terminal-accent text-terminal-bg rounded-lg hover:opacity-90 transition-opacity"
                >
                  Download
                </button>
              </div>
            </div>
          </div>
        )}

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
