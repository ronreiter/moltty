import { useEffect, useRef, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { useStore } from '../store'
import { CODING_TOOLS } from '../services/api'
import { getTheme, type ThemeId } from '../services/themes'

export function useTerminal(sessionId: string | null) {
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  const cleanupListenersRef = useRef<(() => void) | null>(null)

  const initTerminal = useCallback(
    (container: HTMLDivElement, onReady?: () => void) => {
      if (!sessionId || terminalRef.current) return

      const session = useStore.getState().sessions.find((s) => s.id === sessionId)

      const themeId = (useStore.getState().settings?.theme || 'dark1') as ThemeId
      const appTheme = getTheme(themeId)

      const terminal = new Terminal({
        cursorBlink: false,
        fontSize: 14,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        theme: appTheme.terminal
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

      // Web links: click to open URLs in browser
      terminal.loadAddon(new WebLinksAddon((_event, uri) => {
        window.electronAPI.openExternal(uri)
      }))

      // File path links: click to open local paths
      terminal.registerLinkProvider({
        provideLinks(lineNumber, callback) {
          const line = terminal.buffer.active.getLine(lineNumber - 1)
          if (!line) return callback(undefined)
          const text = line.translateToString()
          const links: { startIndex: number; length: number; text: string }[] = []
          const re = /(?:^|[\s('"=])((\/[\w.@+\-][\w.@+\-/]*|~\/[\w.@+\-/]+))(?=[\s)'",:;]|$)/g
          let match: RegExpExecArray | null
          while ((match = re.exec(text)) !== null) {
            const fullMatch = match[1]
            const idx = text.indexOf(fullMatch, match.index)
            links.push({ startIndex: idx, length: fullMatch.length, text: fullMatch })
          }
          if (links.length === 0) return callback(undefined)
          callback(links.map((l) => ({
            range: { start: { x: l.startIndex + 1, y: lineNumber }, end: { x: l.startIndex + l.length + 1, y: lineNumber } },
            text: l.text,
            activate(_event: MouseEvent, linkText: string) {
              window.electronAPI.openPath(linkText)
            }
          })))
        }
      })

      terminalRef.current = terminal
      fitAddonRef.current = fitAddon

      let readyCalled = false
      let busyTimer: ReturnType<typeof setTimeout> | null = null
      let busyStartTimer: ReturnType<typeof setTimeout> | null = null
      let outputBytes = 0
      let lastInputTime = 0
      let inOsc = false
      const BUSY_THRESHOLD = 500 // bytes of output before showing busy indicator
      const INPUT_ECHO_WINDOW = 150 // ms to ignore output after input (echo)
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
        // Track busy state — only mark busy after sustained output, ignore input echo
        const isEcho = Date.now() - lastInputTime < INPUT_ECHO_WINDOW
        if (!isEcho) outputBytes += data.length
        if (outputBytes >= BUSY_THRESHOLD && !useStore.getState().busySessionIds.has(sessionId)) {
          useStore.getState().markSessionBusy(sessionId)
        } else if (!busyStartTimer && outputBytes < BUSY_THRESHOLD) {
          busyStartTimer = setTimeout(() => {
            busyStartTimer = null
            if (outputBytes >= BUSY_THRESHOLD) {
              useStore.getState().markSessionBusy(sessionId)
            }
          }, 500)
        }
        if (busyTimer) clearTimeout(busyTimer)
        busyTimer = setTimeout(() => {
          const wasBusy = useStore.getState().busySessionIds.has(sessionId)
          outputBytes = 0
          useStore.getState().markSessionIdle(sessionId)
          // Mark tab activity and notify when a real task finishes (was busy, now idle)
          if (wasBusy && useStore.getState().activeSessionId !== sessionId) {
            useStore.getState().markTabActivity(sessionId)
            if (useStore.getState().settings?.notifications !== false) {
              const session = useStore.getState().sessions.find((s) => s.id === sessionId)
              window.electronAPI.showNotification('Moltty', `${session?.name || 'Session'} finished a task`)
            }
          }
        }, 2000)
        // Detect standalone BEL (\x07) not inside OSC sequences for notifications
        for (let i = 0; i < data.length; i++) {
          const ch = data.charCodeAt(i)
          if (ch === 0x1b && i + 1 < data.length && data.charCodeAt(i + 1) === 0x5d) {
            inOsc = true // ESC ] starts OSC
            i++ // skip ]
          } else if (inOsc && ch === 0x07) {
            inOsc = false // BEL terminates OSC — ignore
          } else if (ch === 0x07 && !inOsc) {
            // Standalone BEL — notify if background tab
            if (useStore.getState().activeSessionId !== sessionId) {
              const session = useStore.getState().sessions.find((s) => s.id === sessionId)
              window.electronAPI.showNotification('Moltty', `${session?.name || 'Session'} needs attention`)
            }
          }
        }
      })

      const removeExit = window.electronAPI.onLocalPtyExit((sid, exitCode) => {
        if (sid !== sessionId) return
        useStore.getState().markSessionUnloaded(sessionId)
        useStore.getState().markSessionClosed(sessionId)
        terminal.write(`\r\n\x1b[31mProcess exited (code ${exitCode}).\x1b[0m\r\n`)
        // Notify on process exit when window is hidden
        if (document.hidden) {
          const session = useStore.getState().sessions.find((s) => s.id === sessionId)
          window.electronAPI.showNotification('Moltty', `${session?.name || 'Session'} exited (code ${exitCode})`)
        }
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
        if (event.key === 'Enter' && event.shiftKey) {
          if (event.type === 'keydown') {
            lastInputTime = Date.now()
            window.electronAPI.sendLocalPtyInput(sessionId, '\x1b\r')
          }
          return false
        }
        return true
      })

      terminal.onData((data) => {
        lastInputTime = Date.now()
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

  // Update terminal theme and font size when settings change
  useEffect(() => {
    const unsubscribe = useStore.subscribe((state, prev) => {
      if (!terminalRef.current) return
      if (state.settings?.theme !== prev.settings?.theme) {
        const themeId = (state.settings?.theme || 'dark1') as ThemeId
        const appTheme = getTheme(themeId)
        terminalRef.current.options.theme = appTheme.terminal
      }
      if (state.fontSize !== prev.fontSize) {
        terminalRef.current.options.fontSize = state.fontSize
        fitAddonRef.current?.fit()
      }
    })
    return unsubscribe
  }, [])

  return { initTerminal, terminalRef, searchAddonRef }
}
