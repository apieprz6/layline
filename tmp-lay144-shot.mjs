// THROWAWAY (LAY-144) — signs in the e2e admin fixture and screenshots the three
// variants at 390px. Same mechanism as e2e/auth.setup.ts, minus Playwright's runner.
import nextEnv from '@next/env'
const { loadEnvConfig } = nextEnv
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { chromium } from '@playwright/test'

loadEnvConfig(process.cwd())

const BASE = process.env.SHOT_BASE ?? 'http://127.0.0.1:4300'
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const EMAIL = 'e2e-admin@example.test'
const PASSWORD = 'e2e-admin-local-only-fixture'

const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
let { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
let user = list.users.find((u) => u.email === EMAIL)
if (!user) {
  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  })
  if (error) throw error
  user = data.user
} else {
  await admin.auth.admin.updateUserById(user.id, { password: PASSWORD, email_confirm: true })
}
await admin.from('profiles').update({ role: 'admin' }).eq('id', user.id)

const anon = createClient(url, anonKey, { auth: { persistSession: false } })
const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({
  email: EMAIL,
  password: PASSWORD,
})
if (signInError) throw signInError

const captured = []
const ssr = createServerClient(url, anonKey, {
  cookies: { getAll: () => [], setAll: (cs) => captured.push(...cs) },
})
await ssr.auth.setSession(signIn.session)
if (captured.length === 0) throw new Error('no cookies captured')

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
})
await ctx.addCookies(
  captured.map(({ name, value, options }) => ({
    name,
    value,
    domain: '127.0.0.1',
    path: options?.path ?? '/',
    httpOnly: options?.httpOnly ?? true,
    secure: false,
    sameSite: 'Lax',
  }))
)
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text()))

const hydrated = async () => {
  const deadline = Date.now() + 15000
  for (;;) {
    const ok = await page.evaluate(() => {
      const walk = (el) =>
        Object.keys(el).some((k) => k.startsWith('__reactFiber$')) ||
        Array.from(el.children).some(walk)
      return walk(document.body)
    })
    if (ok) return
    if (Date.now() > deadline) throw new Error('never hydrated')
    await page.waitForTimeout(250)
  }
}

const steps = JSON.parse(process.env.SHOT_STEPS ?? '[]')
for (const step of steps) {
  await page.goto(`${BASE}${step.path}`)
  await hydrated()
  for (const click of step.clicks ?? []) {
    const loc = page.getByRole(click.role, { name: new RegExp(click.name) }).first()
    // The node itself must carry React's fiber expando — a body-wide check passes as soon
    // as the *layout* hydrates, and a click on an un-hydrated button still "succeeds".
    await loc.evaluate((el) => el, {})
    await page.waitForFunction(
      (name) => {
        const btn = Array.from(document.querySelectorAll('button')).find((b) =>
          new RegExp(name).test((b.textContent ?? '').trim())
        )
        return !!btn && Object.keys(btn).some((k) => k.startsWith('__reactFiber$'))
      },
      click.name,
      { timeout: 15000 }
    )
    await loc.click()
    await page.waitForTimeout(400)
    if (process.env.SHOT_DEBUG) {
      console.log('  clicked', click.name, 'aria-expanded=', await loc.getAttribute('aria-expanded'))
    }
  }
  await page.waitForTimeout(300)
  await page.screenshot({ path: `/tmp/lay144/${step.out}.png`, fullPage: step.full ?? false })
  console.log('shot', step.out, page.url())
}

await browser.close()
