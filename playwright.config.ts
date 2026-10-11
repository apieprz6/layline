import { defineConfig, devices } from '@playwright/test'
import { loadEnvConfig } from '@next/env'

// `next start` (the webServer below) loads `.env.local` itself, but this config file and
// `e2e/auth.setup.ts` run in Playwright's own Node process, which does not — so without this,
// the setup project sees none of the Supabase env it needs. Next's own loader, not a second
// dotenv dependency, so `.env.local` is read exactly the way the app itself reads it.
loadEnvConfig(process.cwd())

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

// The one line that decides which project collects which spec. Both `testIgnore` below and
// `testMatch` for the two `-auth` projects derive from this, rather than four independently
// hand-written regexes, so a project that forgets it fails to collect anything instead of
// silently running an authenticated spec with no session.
const AUTHENTICATED_DIR = /authenticated\//

// Mobile first: AGENTS.md designs for a 390px viewport. Chromium explicitly — only Chromium is
// installed, and the iPhone device descriptors default to WebKit. Shared between `mobile-390`
// and `mobile-390-auth` so the two can never drift to different device characteristics.
const MOBILE_390 = {
  ...devices['Desktop Chrome'],
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
}
const DESKTOP = { ...devices['Desktop Chrome'] }

const ADMIN_STORAGE_STATE = './e2e/.auth/admin.json'

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
      // Bootstraps the admin fixture session (e2e/auth.setup.ts) that
      // `mobile-390-auth` and `desktop-auth` depend on. Matched by name, not
      // by the `.spec`/`.test` suffix the other projects look for, so it
      // never runs as a test in its own right under `mobile-390`/`desktop`.
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      // Writes the one synthetic Race the Instrument Tuning charts are driven over, and removes it
      // again afterwards. Depends on `setup` because it attributes the Race to the admin fixture
      // that script creates. See `e2e/fixtures/synthetic-race.ts` on why a fixture Race exists at
      // all when the real archive is measured in Jest.
      name: 'archive',
      testMatch: /archive\.setup\.ts/,
      dependencies: ['setup'],
      teardown: 'archive-teardown',
    },
    {
      name: 'archive-teardown',
      testMatch: /archive\.teardown\.ts/,
    },
    {
      name: 'mobile-390',
      // `e2e/authenticated/` is guest-proof by construction: these two
      // projects carry no storageState, so a spec that needs a session
      // belongs under the `-auth` projects below, never here.
      testIgnore: AUTHENTICATED_DIR,
      use: MOBILE_390,
    },
    {
      name: 'desktop',
      testIgnore: AUTHENTICATED_DIR,
      use: DESKTOP,
    },
    {
      // The admin fixture's viewport counterparts. Same devices as above, plus the storageState
      // `setup` just wrote — the only difference allowed between a guest project and its
      // authenticated twin.
      name: 'mobile-390-auth',
      testMatch: AUTHENTICATED_DIR,
      dependencies: ['setup', 'archive'],
      use: { ...MOBILE_390, storageState: ADMIN_STORAGE_STATE },
    },
    {
      name: 'desktop-auth',
      testMatch: AUTHENTICATED_DIR,
      dependencies: ['setup', 'archive'],
      use: { ...DESKTOP, storageState: ADMIN_STORAGE_STATE },
    },
  ],
  webServer: {
    command: `npx next build && npx next start -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    // Opens `/dev/race-track`, which 404s everywhere else. ADR 0033 requires a browser test that
    // asserts the map's own transform, and there is no race in any local database to open one on —
    // the archive is hand-entered through the finished UI, so nothing seeds a recording. The
    // harness mounts the real component over the real drawing function; see the route's own
    // comment. A server reused via `reuseExistingServer` that was started without this will 404,
    // which the spec reports as a missing harness rather than as a broken map.
    env: { ...process.env, LAYLINE_TRACK_HARNESS: '1' },
  },
})
