import { defineConfig, devices } from '@playwright/test'

/**
 * Browser tests run against the **production** server, not `next dev`.
 *
 * In the agent environment `next dev`'s HMR websocket handshake fails
 * (`ERR_INVALID_HTTP_RESPONSE`) and the page never hydrates — no
 * `__reactFiber$` on any node, so no click ever fires a handler and every
 * interactive assertion silently reads the server-rendered markup instead.
 * `next build && next start` hydrates normally. Server-rendered markup is
 * still fine to read off the dev server with `curl`; anything needing a
 * click belongs here.
 *
 * `testDir` is scoped to `e2e/` on purpose: Playwright's default testMatch
 * would otherwise collect the Jest suites in `__tests__/` and run them under
 * the wrong runner.
 */

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 4200)
const baseURL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.artifacts',
  fullyParallel: true,
  workers: 2,
  reporter: [['list']],
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      // Mobile first: AGENTS.md designs for a 390px viewport.
      // Chromium explicitly — only Chromium is installed, and the iPhone
      // device descriptors default to WebKit.
      name: 'mobile-390',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npx next build && npx next start -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
})
