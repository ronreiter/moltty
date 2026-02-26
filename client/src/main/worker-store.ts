import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { randomUUID } from 'crypto'

export interface WorkerConfig {
  workerId: string
  workerName: string
}

function getStorePath(): string {
  const dir = join(app.getPath('userData'), 'moltty-data')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'worker.json')
}

export function saveWorkerConfig(config: WorkerConfig): void {
  writeFileSync(getStorePath(), JSON.stringify(config), 'utf-8')
}

export function loadWorkerConfig(): WorkerConfig | null {
  try {
    const raw = readFileSync(getStorePath(), 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function ensureWorkerId(): WorkerConfig {
  const existing = loadWorkerConfig()
  if (existing) {
    return existing
  }

  const config: WorkerConfig = {
    workerId: randomUUID(),
    workerName: `Worker-${require('os').hostname()}`
  }
  saveWorkerConfig(config)
  return config
}
