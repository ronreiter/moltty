import { useEffect, useRef, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { TerminalWebSocket } from '../services/ws'
import { api } from '../services/api'

export function useTerminal(sessionId: string | null) {
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<TerminalWebSocket | null>(null)

  const initTerminal = useCallback(
    (container: HTMLDivElement) => {
      if (!sessionId || terminalRef.current) return

      const terminal = new Terminal({
        cursorBlink: false,
        fontSize: 14,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        theme: {
          background: '#1e1e2e',
          foreground: '#cdd6f4',
          cursor: '#f5e0dc',
          selectionBackground: '#585b70',
          black: '#45475a',
          red: '#f38ba8',
          green: '#a6e3a1',
          yellow: '#f9e2af',
          blue: '#89b4fa',
          magenta: '#f5c2e7',
          cyan: '#94e2d5',
          white: '#bac2de',
          brightBlack: '#585b70',
          brightRed: '#f38ba8',
          brightGreen: '#a6e3a1',
          brightYellow: '#f9e2af',
          brightBlue: '#89b4fa',
          brightMagenta: '#f5c2e7',
          brightCyan: '#94e2d5',
          brightWhite: '#a6adc8'
        }
      })

      const fitAddon = new FitAddon()
      terminal.loadAddon(fitAddon)

      terminal.open(container)
      fitAddon.fit()

      // Try WebGL addon
      try {
        const webglAddon = new WebglAddon()
        webglAddon.onContextLoss(() => {
          webglAddon.dispose()
        })
        terminal.loadAddon(webglAddon)
      } catch {
        // WebGL not available, canvas renderer used instead
      }

      terminalRef.current = terminal
      fitAddonRef.current = fitAddon

      // Track scroll position -- stays true unless user scrolls up
      let isScrolledToBottom = true
      terminal.onScroll(() => {
        const buf = terminal.buffer.active
        isScrolledToBottom = buf.viewportY >= buf.baseY
      })

      // Connect WebSocket
      api.getTerminalWSUrl(sessionId).then((url) => {
        const ws = new TerminalWebSocket(
          url,
          (data) => {
            const wasAtBottom = isScrolledToBottom
            terminal.write(new Uint8Array(data as ArrayBuffer))
            if (wasAtBottom) {
              terminal.scrollToBottom()
            }
          },
          () => {
            terminal.write('\r\n\x1b[31mConnection lost.\x1b[0m\r\n')
          },
          () => {
            // Send resize once connection is open
            ws.sendResize(terminal.cols, terminal.rows)
          }
        )
        ws.connect()
        wsRef.current = ws
      })

      // Terminal input -> WS
      terminal.onData((data) => {
        const encoder = new TextEncoder()
        wsRef.current?.send(encoder.encode(data).buffer as ArrayBuffer)
      })

      const resizeObserver = new ResizeObserver(() => {
        const wasAtBottom = isScrolledToBottom
        fitAddon.fit()
        if (wasAtBottom) {
          terminal.scrollToBottom()
        }
        wsRef.current?.sendResize(terminal.cols, terminal.rows)
      })
      resizeObserver.observe(container)

      return () => {
        resizeObserver.disconnect()
        wsRef.current?.disconnect()
        terminal.dispose()
        terminalRef.current = null
        fitAddonRef.current = null
        wsRef.current = null
      }
    },
    [sessionId]
  )

  // Clean up on sessionId change
  useEffect(() => {
    return () => {
      wsRef.current?.disconnect()
      terminalRef.current?.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
      wsRef.current = null
    }
  }, [sessionId])

  return { initTerminal }
}
