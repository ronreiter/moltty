import { useEffect, useCallback } from 'react'
import { useStore } from '../store'
import { api } from '../services/api'

export function useAuth() {
  const { isAuthenticated, setTokens, clearAuth } = useStore()

  useEffect(() => {
    // Load stored tokens on mount
    window.electronAPI.getToken().then((tokens) => {
      if (tokens) {
        setTokens(tokens.accessToken, tokens.refreshToken)
      }
    })

    // Listen for OAuth callbacks
    window.electronAPI.onOAuthCallback((tokens) => {
      setTokens(tokens.accessToken, tokens.refreshToken)
    })
  }, [setTokens])

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.login(email, password)
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Login failed')
      }
      const tokens = await res.json()
      await window.electronAPI.setToken(tokens)
      setTokens(tokens.accessToken, tokens.refreshToken)
    },
    [setTokens]
  )

  const register = useCallback(
    async (email: string, password: string, name: string) => {
      const res = await api.register(email, password, name)
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Registration failed')
      }
      const tokens = await res.json()
      await window.electronAPI.setToken(tokens)
      setTokens(tokens.accessToken, tokens.refreshToken)
    },
    [setTokens]
  )

  const logout = useCallback(async () => {
    await window.electronAPI.clearToken()
    clearAuth()
  }, [clearAuth])

  return { isAuthenticated, login, register, logout }
}
