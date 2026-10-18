import { defineConfig, devices } from '@playwright/test';

// Public excerpts need the standalone static frontend, independent of the private API's CSP.
export default defineConfig({
  testDir: '.', testMatch: 'static-demo.spec.ts', fullyParallel: false, workers: 1,
  timeout: 90_000, expect: { timeout: 12_000 }, retries: 0,
  reporter: [['list']], outputDir: '../../tmp/e2e-static-demo',
  use: {
    baseURL: 'http://127.0.0.1:3102', channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
    screenshot: 'only-on-failure', trace: 'retain-on-failure', actionTimeout: 15_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: { command: 'npx vite --host 127.0.0.1 --port 3102 --strictPort', cwd: '../..', url: 'http://127.0.0.1:3102', reuseExistingServer: true, timeout: 60_000 },
});
