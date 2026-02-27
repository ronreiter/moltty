import React, { useEffect, useRef, useImperativeHandle, forwardRef, useState } from 'react'
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
  const [loading, setLoading] = useState(true)
  const { initTerminal, terminalRef } = useTerminal(sessionId)

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

  return (
    <div className="w-full h-full relative" style={{ padding: '4px' }}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-terminal-bg">
          <div className="flex flex-col items-center gap-3">
            <div className="w-5 h-5 border-2 border-terminal-accent/30 border-t-terminal-accent rounded-full animate-spin" />
            <span className="text-xs text-terminal-subtext">Starting session...</span>
          </div>
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" />
    </div>
  )
})

TerminalComponent.displayName = 'Terminal'
export default TerminalComponent
