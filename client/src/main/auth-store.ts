import { safeStorage, app } from 'electron'
import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs'
import { join } from 'path'

export interface TokenData {
  accessToken: string
  refreshToken: string
}

function getStorePath(): string {
  const dir = join(app.getPath('userData'), 'moltty-data')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'auth.json')
}

export function saveTokens(tokens: TokenData): void {
  const json = JSON.stringify(tokens)
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(json)
    writeFileSync(getStorePath(), encrypted.toString('base64'), 'utf-8')
  } else {
    writeFileSync(getStorePath(), json, 'utf-8')
  }
}

export function loadTokens(): TokenData | null {
  try {
    const raw = readFileSync(getStorePath(), 'utf-8')
    if (safeStorage.isEncryptionAvailable()) {
      const buffer = Buffer.from(raw, 'base64')
      const decrypted = safeStorage.decryptString(buffer)
      return JSON.parse(decrypted)
    }
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function clearTokens(): void {
  try {
    unlinkSync(getStorePath())
  } catch {
    // file doesn't exist, that's fine
  }
}
