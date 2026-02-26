import React from 'react'
import { useAuth } from './hooks/useAuth'
import { useStore } from './store'
import LoginForm from './components/LoginForm'
import Sidebar from './components/Sidebar'
import Terminal from './components/Terminal'

export default function App() {
  const { isAuthenticated } = useAuth()
  const activeSessionId = useStore((s) => s.activeSessionId)
  const activeSession = useStore((s) => s.sessions.find((sess) => sess.id === s.activeSessionId))

  if (!isAuthenticated) {
    return <LoginForm />
  }

  return (
    <div className="flex h-screen bg-terminal-bg">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        {/* Titlebar drag area for main content */}
        <div className="titlebar-drag h-10 flex-shrink-0" />

        {activeSessionId ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* CWD header */}
            {activeSession?.workDir && (
              <div className="flex-shrink-0 px-4 py-1.5 bg-terminal-surface border-b border-terminal-border">
                <span className="text-xs text-terminal-subtext font-mono">
                  {activeSession.workDir.replace(/^\/Users\/[^/]+/, '~')}
                </span>
              </div>
            )}
            <div className="flex-1 overflow-hidden">
              <Terminal sessionId={activeSessionId} />
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
