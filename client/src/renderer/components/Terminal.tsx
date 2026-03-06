import React, { useEffect, useRef, useImperativeHandle, forwardRef, useState, useCallback } from 'react'
import { useTerminal } from '../hooks/useTerminal'
import '@xterm/xterm/css/xterm.css'

export interface TerminalHandle {
  focus: () => void
}

interface Props {
  sessionId: string
}

const TerminalComponent = forwardRef<TerminalHandle, Props>(({ sessionId }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(true)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const { initTerminal, terminalRef, searchAddonRef } = useTerminal(sessionId)

  useImperativeHandle(ref, () => ({
    focus: () => terminalRef.current?.focus()
  }))

  useEffect(() => {
    if (containerRef.current) {
      cleanupRef.current?.()
      setLoading(true)
      const cleanup = initTerminal(containerRef.current, () => setLoading(false))
      cleanupRef.current = cleanup || null
    }

    return () => {
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }, [sessionId, initTerminal])

  const openSearch = useCallback(() => {
    setSearchOpen(true)
    requestAnimationFrame(() => searchInputRef.current?.focus())
  }, [])

  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    setSearchQuery('')
    searchAddonRef.current?.clearDecorations()
    terminalRef.current?.focus()
  }, [searchAddonRef, terminalRef])

  const findNext = useCallback(() => {
    if (searchQuery) searchAddonRef.current?.findNext(searchQuery)
  }, [searchQuery, searchAddonRef])

  const findPrevious = useCallback(() => {
    if (searchQuery) searchAddonRef.current?.findPrevious(searchQuery)
  }, [searchQuery, searchAddonRef])

  // Cmd/Ctrl+F to open search — listen on window since xterm captures keyboard events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        // Only handle if this terminal's container is visible
        const el = containerRef.current?.closest('.absolute.inset-0') as HTMLElement | null
        if (el && el.style.visibility !== 'hidden') {
          e.preventDefault()
          if (searchOpen) {
            searchInputRef.current?.focus()
            searchInputRef.current?.select()
          } else {
            openSearch()
          }
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [searchOpen, openSearch])

  // Search as you type
  useEffect(() => {
    if (searchOpen && searchQuery) {
      searchAddonRef.current?.findNext(searchQuery)
    } else if (!searchQuery) {
      searchAddonRef.current?.clearDecorations()
    }
  }, [searchQuery, searchOpen, searchAddonRef])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const files = e.dataTransfer.files
    if (files.length > 0 && sessionId) {
      const paths = Array.from(files).map((f) => (f as any).path as string).filter(Boolean)
      if (paths.length > 0) {
        const text = paths.join(' ')
        window.electronAPI.sendLocalPtyInput(sessionId, text)
      }
    }
  }, [sessionId])

  return (
    <div className="w-full h-full relative" style={{ padding: '4px' }} onDragOver={handleDragOver} onDrop={handleDrop}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-terminal-bg">
          <div className="flex flex-col items-center gap-3">
            <div className="w-5 h-5 border-2 border-terminal-accent/30 border-t-terminal-accent rounded-full animate-spin" />
            <span className="text-xs text-terminal-subtext">Starting session...</span>
          </div>
        </div>
      )}
      {searchOpen && (
        <div className="absolute top-1 right-4 z-20 flex items-center gap-1 bg-terminal-surface border border-terminal-border rounded-lg px-2 py-1 shadow-lg">
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.shiftKey ? findPrevious() : findNext()
              }
              if (e.key === 'Escape') {
                closeSearch()
              }
            }}
            placeholder="Search..."
            className="bg-terminal-bg text-terminal-text text-xs px-2 py-1 rounded outline-none border border-terminal-border focus:border-terminal-accent w-48"
          />
          <button
            onClick={findPrevious}
            className="text-terminal-subtext hover:text-terminal-text text-xs px-1"
            title="Previous (Shift+Enter)"
          >
            &#x25B2;
          </button>
          <button
            onClick={findNext}
            className="text-terminal-subtext hover:text-terminal-text text-xs px-1"
            title="Next (Enter)"
          >
            &#x25BC;
          </button>
          <button
            onClick={closeSearch}
            className="text-terminal-subtext hover:text-terminal-red text-xs px-1"
            title="Close (Esc)"
          >
            ×
          </button>
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" />
    </div>
  )
})

TerminalComponent.displayName = 'Terminal'
export default TerminalComponent
