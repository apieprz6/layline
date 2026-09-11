# Testing in Layline

Two runners, two different questions.

| Runner | Command | Answers |
|--------|---------|---------|
| **Jest** + React Testing Library | `npm test` | Does this unit, service, or component render and compute correctly? |
| **Playwright** + Chromium | `npm run test:e2e` | Does the real page, in a real browser, actually *behave* — clicks, focus, viewport, off-canvas position? |

They don't overlap and they don't compete. Jest owns `__tests__/`; Playwright owns
`e2e/`. Each config explicitly ignores the other's directory, so a spec placed in
the wrong folder fails loudly rather than being collected by the wrong runner.

## Which one does a change need?

Reach for **Jest** by default. It's a few seconds, it runs everywhere, and most of
what we write — wind classification, buoy parsing, forecast shaping, a card's
markup — is fully answerable in jsdom.

Reach for **Playwright** only when the thing under test cannot exist without a
browser:

- an element's **position** rather than its presence (the drawer panel is always in
  the DOM, translated off-canvas when closed — `toBeInViewport()` is the only
  honest assertion)
- **hydration-dependent behaviour**: a click that must fire a real handler
- **viewport-dependent** layout, especially the 390px mobile target
- focus, keyboard (`Escape`), and scroll behaviour

If a Jest test can answer the question, write the Jest test.

## Running the browser tests

```bash
npm run test:e2e                       # both viewport projects
npm run test:e2e -- --project=mobile-390
npm run test:e2e -- e2e/drawer.spec.ts
npm run test:e2e:report                # open the HTML report after a failure
```

Playwright starts its own server (see `playwright.config.ts`) — you do **not**
need `npm run dev` running. First run pays for a production build, so budget
roughly a minute before any test executes. Failures keep a screenshot and a
trace under `e2e/.artifacts/` (gitignored).

Two projects run every spec: `mobile-390` (390×844, touch, the viewport
AGENTS.md designs for) and `desktop`. Only Chromium is installed, so both are
Chromium-based; the built-in iPhone device descriptors default to WebKit and
will fail with a missing-executable error if you reach for them.

## The trap: browser tests run against the production build

`playwright.config.ts` runs `next build && next start`, not `next dev`. This is
deliberate and it is load-bearing.

In the agent/dev container, `next dev`'s HMR websocket handshake fails with
`ERR_INVALID_HTTP_RESPONSE` and **the page never hydrates** — no `__reactFiber$`
expando appears on any node. The failure mode is nasty because it doesn't look
like a failure: a Playwright click on an un-hydrated element *succeeds*. The DOM
node is right there, it just has no handler attached, so Playwright reports the
click fine, never retries, and only the *next* assertion fails — looking exactly
like a bad selector. Hours disappear into rewriting a locator that was correct
all along.

`next start` hydrates normally, which is why the suite lives there.

**Consequence for every test you write:** navigate with `gotoHydrated()` from
`e2e/hydrated.ts`, never a bare `page.goto()`. It polls for React's own fiber
marker, so a genuine hydration failure surfaces as a clear timeout with a
pointer to this document instead of a mystery selector bug.

```ts
import { gotoHydrated } from './hydrated'

test('something interactive', async ({ page }) => {
  await gotoHydrated(page)          // not page.goto('/')
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
})
```

Reading *server-rendered markup* off `next dev` with `curl` is still perfectly
fine — the markup is correct, only hydration is broken. Anything needing a click
belongs in `e2e/`.

## Environment setup

Chromium and its system libraries are already installed in this container. On a
fresh machine:

```bash
npx playwright install chromium
DEBIAN_FRONTEND=noninteractive npx playwright install-deps chromium   # Linux only
```

The `DEBIAN_FRONTEND` prefix matters on Linux: without it, `install-deps` can
stall on an interactive debconf prompt (e.g. a pending kernel upgrade) and print
"Failed to open terminal". That prompt is cosmetic — verify with `dpkg --audit`
and by launching a browser — but it's easier to avoid than to diagnose.

## What is not automatable

**The Google OAuth round trip.** Google blocks sign-in from automated browsers,
so no Playwright test can carry a real account through `/auth/callback`. Tickets
that depend on a completed sign-in keep owner-verification acceptance criteria,
and that is not a gap to be closed by cleverness — don't burn a session trying.

Anything downstream of an *established* session can still be tested by seeding
Supabase auth cookies or storage state; it's only the provider handshake that is
off limits.
