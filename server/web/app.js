// Moltty Web Terminal Viewer
(function () {
  const API_BASE = window.location.origin + '/api'
  let accessToken = null
  let refreshToken = null
  let currentSessionId = null
  let terminal = null
  let fitAddon = null
  let ws = null

  // DOM elements
  const loginForm = document.getElementById('login-form')
  const loginError = document.getElementById('login-error')
  const emailInput = document.getElementById('email')
  const passwordInput = document.getElementById('password')
  const loginBtn = document.getElementById('login-btn')
  const appDiv = document.getElementById('app')
  const sessionList = document.getElementById('session-list')
  const terminalContainer = document.getElementById('terminal-container')
  const noSession = document.getElementById('no-session')
  const logoutBtn = document.getElementById('logout-btn')

  // Auth
  loginBtn.addEventListener('click', async () => {
    loginError.style.display = 'none'
    const email = emailInput.value.trim()
    const password = passwordInput.value

    if (!email || !password) {
      showError('Email and password required')
      return
    }

    try {
      const res = await fetch(API_BASE + '/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      if (!res.ok) {
        const data = await res.json()
        showError(data.error || 'Login failed')
        return
      }
      const tokens = await res.json()
      accessToken = tokens.accessToken
      refreshToken = tokens.refreshToken
      localStorage.setItem('moltty_tokens', JSON.stringify(tokens))
      showApp()
    } catch (err) {
      showError('Connection error')
    }
  })

  passwordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loginBtn.click()
  })

  logoutBtn.addEventListener('click', () => {
    accessToken = null
    refreshToken = null
    localStorage.removeItem('moltty_tokens')
    disconnectTerminal()
    loginForm.style.display = 'block'
    appDiv.style.display = 'none'
  })

  function showError(msg) {
    loginError.textContent = msg
    loginError.style.display = 'block'
  }

  function showApp() {
    loginForm.style.display = 'none'
    appDiv.style.display = 'flex'
    loadSessions()
  }

  // Sessions
  async function loadSessions() {
    const res = await authFetch('/sessions')
    if (!res || !res.ok) return
    const sessions = await res.json()
    renderSessions(sessions)
  }

  function renderSessions(sessions) {
    sessionList.innerHTML = ''
    sessions.forEach((s) => {
      const div = document.createElement('div')
      div.className = 'session-item' + (s.id === currentSessionId ? ' active' : '')
      div.innerHTML = `<span class="status-dot status-${s.status}"></span><span>${escapeHtml(s.name)}</span>`
      div.addEventListener('click', () => connectToSession(s.id))
      sessionList.appendChild(div)
    })
  }

  function escapeHtml(str) {
    const div = document.createElement('div')
    div.textContent = str
    return div.innerHTML
  }

  // Terminal
  function connectToSession(sessionId) {
    if (currentSessionId === sessionId) return
    disconnectTerminal()
    currentSessionId = sessionId

    noSession.style.display = 'none'
    terminalContainer.style.display = 'block'

    terminal = new window.Terminal({
      cursorBlink: true,
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
        white: '#bac2de'
      }
    })

    fitAddon = new window.FitAddon.FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(terminalContainer)
    fitAddon.fit()

    // Connect WebSocket
    const wsUrl = `ws://${window.location.host}/api/sessions/${sessionId}/terminal?token=${accessToken}`
    ws = new WebSocket(wsUrl)
    ws.binaryType = 'arraybuffer'

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'resize', cols: terminal.cols, rows: terminal.rows }))
    }

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        terminal.write(new Uint8Array(event.data))
      }
    }

    ws.onclose = () => {
      terminal.write('\r\n\x1b[31mConnection closed.\x1b[0m\r\n')
    }

    // Terminal input -> WS
    terminal.onData((data) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        const encoder = new TextEncoder()
        ws.send(encoder.encode(data))
      }
    })

    // Resize
    const resizeObserver = new ResizeObserver(() => {
      if (fitAddon) {
        fitAddon.fit()
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols: terminal.cols, rows: terminal.rows }))
        }
      }
    })
    resizeObserver.observe(terminalContainer)

    // Highlight active session
    document.querySelectorAll('.session-item').forEach((el, i) => {
      el.classList.toggle('active', el.querySelector('.status-dot') !== null)
    })
    loadSessions()
  }

  function disconnectTerminal() {
    if (ws) {
      ws.close()
      ws = null
    }
    if (terminal) {
      terminal.dispose()
      terminal = null
      fitAddon = null
    }
    terminalContainer.innerHTML = ''
    currentSessionId = null
  }

  // Auth fetch with refresh
  async function authFetch(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + accessToken,
      ...(options.headers || {})
    }
    let res = await fetch(API_BASE + path, { ...options, headers })
    if (res.status === 401 && refreshToken) {
      const refreshRes = await fetch(API_BASE + '/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      })
      if (refreshRes.ok) {
        const tokens = await refreshRes.json()
        accessToken = tokens.accessToken
        refreshToken = tokens.refreshToken
        localStorage.setItem('moltty_tokens', JSON.stringify(tokens))
        headers.Authorization = 'Bearer ' + accessToken
        res = await fetch(API_BASE + path, { ...options, headers })
      } else {
        logoutBtn.click()
        return null
      }
    }
    return res
  }

  // Init: check for stored tokens
  try {
    const stored = JSON.parse(localStorage.getItem('moltty_tokens'))
    if (stored && stored.accessToken) {
      accessToken = stored.accessToken
      refreshToken = stored.refreshToken
      showApp()
      return
    }
  } catch {}
})()
