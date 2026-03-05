import { useEffect, useRef, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { SearchAddon } from '@xterm/addon-search'
import { useStore } from '../store'
import { CODING_TOOLS } from '../services/api'

export function useTerminal(sessionId: string | null) {
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  const cleanupListenersRef = useRef<(() => void) | null>(null)

  const initTerminal = useCallback(
    (container: HTMLDivElement, onReady?: () => void) => {
      if (!sessionId || terminalRef.current) return

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

      const searchAddon = new SearchAddon()
      terminal.loadAddon(searchAddon)
      searchAddonRef.current = searchAddon

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

      let readyCalled = false
      const removeOutput = window.electronAPI.onLocalPtyOutput((sid, data) => {
        if (sid !== sessionId) return
        if (!readyCalled) {
          readyCalled = true
          useStore.getState().markSessionLoaded(sessionId)
          onReady?.()
        }
        const buf = terminal.buffer.active
        const wasAtBottom = buf.baseY === 0 || buf.viewportY >= buf.baseY - 1
        terminal.write(data)
        if (wasAtBottom) {
          terminal.scrollToBottom()
        }
      })

      const removeExit = window.electronAPI.onLocalPtyExit((sid, exitCode) => {
        if (sid !== sessionId) return
        useStore.getState().markSessionUnloaded(sessionId)
        useStore.getState().markSessionClosed(sessionId)
        terminal.write(`\r\n\x1b[31mProcess exited (code ${exitCode}).\x1b[0m\r\n`)
      })

      const removeToolDetected = window.electronAPI.onToolSessionDetected?.((sid, toolId) => {
        if (sid !== sessionId) return
        useStore.getState().setToolSessionId(sessionId, toolId)
      }) || (() => {})

      cleanupListenersRef.current = () => {
        removeOutput()
        removeExit()
        removeToolDetected()
      }

      const settings = useStore.getState().settings
      const toolDef = CODING_TOOLS.find((t) => t.id === settings?.codingTool) || CODING_TOOLS[0]
      const command = session?.toolSessionId && toolDef.resumeArg
        ? `${toolDef.command} ${toolDef.resumeArg} ${session.toolSessionId}`
        : toolDef.command
      const loadZshrc = settings?.loadZshrc ?? true
      window.electronAPI.spawnLocalPty(sessionId, command, session?.workDir || '~', loadZshrc).then((result) => {
        if (!result.ok) {
          terminal.write(`\r\n\x1b[31mFailed to start: ${result.error}\x1b[0m\r\n`)
        } else {
          window.electronAPI.resizeLocalPty(sessionId, terminal.cols, terminal.rows)
          if (result.reattached) {
            useStore.getState().markSessionLoaded(sessionId)
            onReady?.()
          }
        }
      })

      // Intercept Shift+Enter to send ESC + CR instead of just CR.
      // xterm.js sends \r for both Enter and Shift+Enter by default, but CLI tools
      // like Claude Code detect ESC-prefixed CR (meta key) as a newline signal.
      terminal.attachCustomKeyEventHandler((event) => {
        if (event.type === 'keydown' && event.key === 'Enter' && event.shiftKey) {
          window.electronAPI.sendLocalPtyInput(sessionId, '\x1b\r')
          return false
        }
        return true
      })

      terminal.onData((data) => {
        window.electronAPI.sendLocalPtyInput(sessionId, data)
      })

      const resizeObserver = new ResizeObserver(() => {
        const buf = terminal.buffer.active
        const wasAtBottom = buf.baseY === 0 || buf.viewportY >= buf.baseY - 1
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
        terminal.dispose()
        terminalRef.current = null
        fitAddonRef.current = null
        searchAddonRef.current = null
      }
    },
    [sessionId]
  )

  useEffect(() => {
    return () => {
      cleanupListenersRef.current?.()
      cleanupListenersRef.current = null
      if (sessionId) {
        window.electronAPI.killLocalPty(sessionId)
        useStore.getState().markSessionUnloaded(sessionId)
      }
      terminalRef.current?.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
      searchAddonRef.current = null
    }
  }, [sessionId])

  return { initTerminal, terminalRef, searchAddonRef }
}
