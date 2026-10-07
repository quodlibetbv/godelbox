import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './src/tests/e2e', fullyParallel: false, workers: 1, timeout: 30000,
  expect: { timeout: 7000 },
  use: { baseURL: 'http://127.0.0.1:5173', browserName: 'chromium', channel: 'chromium', headless: true, viewport: { width: 1440, height: 1000 }, trace: 'off', screenshot: 'off' },
  reporter: [['list']],
  webServer: { command: 'python3 -m http.server 5173 --bind 127.0.0.1 --directory dist', url: 'http://127.0.0.1:5173', reuseExistingServer: false, timeout: 15000 },
})
