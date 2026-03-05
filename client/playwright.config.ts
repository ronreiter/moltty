import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:5188',
    headless: true,
    viewport: { width: 1200, height: 800 }
  },
  webServer: {
    command: 'npx vite --config vite.test.config.ts --port 5188',
    port: 5188,
    reuseExistingServer: !process.env.CI
  }
})
