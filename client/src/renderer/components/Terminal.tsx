import React, { useEffect, useRef } from 'react'
import { useTerminal } from '../hooks/useTerminal'
import '@xterm/xterm/css/xterm.css'

interface Props {
  sessionId: string
}

export default function TerminalComponent({ sessionId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const { initTerminal } = useTerminal(sessionId)

  useEffect(() => {
    if (containerRef.current) {
      cleanupRef.current?.()
      const cleanup = initTerminal(containerRef.current)
      cleanupRef.current = cleanup || null
    }

    return () => {
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }, [sessionId, initTerminal])

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ padding: '4px' }}
    />
  )
}
