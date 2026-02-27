import React, { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import GoogleLoginButton from './GoogleLoginButton'

export default function LoginForm() {
  const { login, register, loginWithTokens } = useAuth()
  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (isRegister) {
        await register(email, password, name)
      } else {
        await login(email, password)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center h-screen bg-terminal-bg">
      <div className="w-96 p-8 bg-terminal-surface rounded-xl shadow-2xl">
        <h1 className="text-3xl font-bold text-center mb-2 text-terminal-text">Moltty</h1>
        <p className="text-terminal-subtext text-center mb-8">Remote Terminal System</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
            <input
              type="text"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 bg-terminal-bg border border-terminal-border rounded-lg text-terminal-text placeholder-terminal-subtext focus:outline-none focus:border-terminal-accent"
              required
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 bg-terminal-bg border border-terminal-border rounded-lg text-terminal-text placeholder-terminal-subtext focus:outline-none focus:border-terminal-accent"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 bg-terminal-bg border border-terminal-border rounded-lg text-terminal-text placeholder-terminal-subtext focus:outline-none focus:border-terminal-accent"
            required
            minLength={8}
          />

          {error && <p className="text-terminal-red text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-terminal-accent text-terminal-bg font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? '...' : isRegister ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <div className="my-6 flex items-center gap-3">
          <div className="flex-1 h-px bg-terminal-border" />
          <span className="text-terminal-subtext text-sm">or</span>
          <div className="flex-1 h-px bg-terminal-border" />
        </div>

        <GoogleLoginButton onTokens={loginWithTokens} />

        <p className="mt-6 text-center text-terminal-subtext text-sm">
          {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            onClick={() => {
              setIsRegister(!isRegister)
              setError('')
            }}
            className="text-terminal-accent hover:underline"
          >
            {isRegister ? 'Sign In' : 'Create Account'}
          </button>
        </p>
      </div>
    </div>
  )
}
