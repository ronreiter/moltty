import { useEffect, useRef, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { TerminalWebSocket } from '../services/ws'
import { api } from '../services/api'
import { useStore } from '../store'

export function useTerminal(sessionId: string | null) {
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<TerminalWebSocket | null>(null)
  const cleanupListenersRef = useRef<(() => void) | null>(null)

  const initTerminal = useCallback(
    (container: HTMLDivElement, onReady?: () => void) => {
      if (!sessionId || terminalRef.current) return

      // Read session from store at call time
      const session = useStore.getState().sessions.find((s) => s.id === sessionId)

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

      try {
        const webglAddon = new WebglAddon()
        webglAddon.onContextLoss(() => {
          webglAddon.dispose()
        })
        terminal.loadAddon(webglAddon)
      } catch {
        // WebGL not available
      }

      terminalRef.current = terminal
      fitAddonRef.current = fitAddon

      let isScrolledToBottom = true
      terminal.onScroll(() => {
        const buf = terminal.buffer.active
        isScrolledToBottom = buf.viewportY >= buf.baseY
      })

      const isLocal = session?.status === 'offline'

      if (isLocal) {
        let readyCalled = false
        const removeOutput = window.electronAPI.onLocalPtyOutput((sid, data) => {
          if (sid !== sessionId) return
          if (!readyCalled) {
            readyCalled = true
            useStore.getState().markSessionLoaded(sessionId)
            onReady?.()
          }
          const wasAtBottom = isScrolledToBottom
          terminal.write(data)
          if (wasAtBottom) {
            terminal.scrollToBottom()
          }
        })

        const removeExit = window.electronAPI.onLocalPtyExit((sid, exitCode) => {
          if (sid !== sessionId) return
          useStore.getState().markSessionUnloaded(sessionId)
          terminal.write(`\r\n\x1b[31mProcess exited (code ${exitCode}).\x1b[0m\r\n`)
        })

        cleanupListenersRef.current = () => {
          removeOutput()
          removeExit()
        }

        // Spawn or reattach to existing PTY
        const command = session?.claudeSessionId
          ? `claude --resume ${session.claudeSessionId}`
          : 'zsh'
        window.electronAPI.spawnLocalPty(sessionId, command, session?.workDir || '~').then((result) => {
          if (!result.ok) {
            terminal.write(`\r\n\x1b[31mFailed to start: ${result.error}\x1b[0m\r\n`)
          } else {
            window.electronAPI.resizeLocalPty(sessionId, terminal.cols, terminal.rows)
            if (result.reattached) {
              // PTY already running — mark loaded immediately
              useStore.getState().markSessionLoaded(sessionId)
              onReady?.()
            }
          }
        })

        terminal.onData((data) => {
          window.electronAPI.sendLocalPtyInput(sessionId, data)
        })

        const resizeObserver = new ResizeObserver(() => {
          const wasAtBottom = isScrolledToBottom
          fitAddon.fit()
          if (wasAtBottom) {
            terminal.scrollToBottom()
          }
          window.electronAPI.resizeLocalPty(sessionId, terminal.cols, terminal.rows)
        })
        resizeObserver.observe(container)

        return () => {
          resizeObserver.disconnect()
          cleanupListenersRef.current?.()
          cleanupListenersRef.current = null
          // Don't kill PTY here — main process tracks the active instance
          terminal.dispose()
          terminalRef.current = null
          fitAddonRef.current = null
        }
      } else {
        api.getTerminalWSUrl(sessionId).then((url) => {
          const ws = new TerminalWebSocket(
            url,
            (data) => {
              onReady?.()
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
              ws.sendResize(terminal.cols, terminal.rows)
            }
          )
          ws.connect()
          wsRef.current = ws
        })

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
      }
    },
    [sessionId]
  )

  // Clean up on sessionId change or final unmount
  useEffect(() => {
    return () => {
      cleanupListenersRef.current?.()
      cleanupListenersRef.current = null
      wsRef.current?.disconnect()
      wsRef.current = null
      if (sessionId) {
        window.electronAPI.killLocalPty(sessionId)
        useStore.getState().markSessionUnloaded(sessionId)
      }
      terminalRef.current?.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [sessionId])

  return { initTerminal, terminalRef }
}
