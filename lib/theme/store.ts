'use client'

import { getTimes } from 'suncalc'
import { readThemePreference, saveThemePreference } from './actions'
import type { ThemePreference, ResolvedTheme } from '@/types'

/**
 * The theme preference, held once per tab.
 *
 * Module state rather than per-component state, and no provider: several screens
 * need it — the root layout, which runs it on every route, the chrome, which says
 * who the sailor is, and the Settings picker, which writes the preference — and
 * before this the chrome and the picker each held their own copy. Neither learned
 * that the other had changed anything, so a stale copy still holding `auto` would
 * re-assert time-based theming at the next dawn and undo an explicit choice
 * (LAY-128). One store makes that unrepresentable.
 *
 * Three things write the theme, in this order of authority:
 *
 * 1. the sailor, through `setThemePreference`;
 * 2. their **Profile**, which is where a choice made on another device is
 *    (`syncThemeWithAccount`);
 * 3. civil twilight at Navy Pier, but only while the preference is `auto`.
 *
 * `localStorage` is not a fourth: it is this store's memory between tabs, and the
 * blocking script in `app/layout.tsx` reads it to get the class right on the very
 * first paint, before any of this has loaded. That duplication of the storage key
 * and the sun math is the wound ADR 0018 records; this file does not widen it.
 */

/** Also read by the blocking script in `app/layout.tsx`, which cannot import it. */
export const THEME_STORAGE_KEY = 'layline-theme-preference'

const NAVY_PIER_LAT = 41.89
const NAVY_PIER_LNG = -87.60
const REEVALUATE_INTERVAL_MS = 60_000

/**
 * What the sailor asked for, and what that means right now. Both together in one
 * object because `useSyncExternalStore` compares snapshots by identity: two stores
 * would re-render subscribers twice for one change, and a fresh object per read
 * would re-render them forever.
 */
export interface ThemeSnapshot {
  theme: ResolvedTheme
  preference: ThemePreference
}

/**
 * What hydration renders. A constant, because the server has no way to know what
 * time it is where the sailor is — and it does not need to: the blocking script has
 * already put the right class on the document, and the first commit after hydration
 * corrects the value React rendered with.
 */
const SERVER_SNAPSHOT: ThemeSnapshot = Object.freeze({
  theme: 'solar',
  preference: 'auto',
})

let snapshot: ThemeSnapshot = SERVER_SNAPSHOT
const subscribers = new Set<() => void>()

let started = false
let timer: ReturnType<typeof setInterval> | null = null

/** The sailor the store has been told about, `null` for a **Guest**. */
let accountUserId: string | null = null
/**
 * Whether the chrome has said who the sailor is, which is a different fact from it
 * having said `null`. Only a route inside `app/(app)/` has chrome to say either.
 */
let identityAnnounced = false
/**
 * Bumped when the chrome names a sailor in place of a *different* one — a sign-out
 * and sign-in inside one tab's life. An answer from the **Profile** that went out
 * under an earlier generation belongs to nobody now, and the store no longer knows
 * whose an answer is: `readThemePreference` resolves the sailor server-side, which
 * is what lets a screen with no chrome ask at all.
 */
let identityGeneration = 0
/** The generation a question has already gone out for. One per tab, per sailor. */
let askedGeneration = -1
/**
 * Whether that question went out before anyone had said who the sailor is.
 *
 * Such an answer is for whoever the cookies named at the time, which on
 * `/auth/callback` is nobody: the browser is still exchanging the code. So it cannot
 * stand as the answer for a sailor the chrome names afterwards, and the chrome doing
 * so is a fresh question rather than a repeat of that one.
 */
let askedAnonymously = false
/**
 * Bumped by every choice the sailor makes, so that a read of the **Profile** which
 * started before a tap can tell that it did and decline to overrule it, and so that
 * a queued write can tell it has been superseded.
 */
let choices = 0
/**
 * Writes to the **Profile**, one after another rather than at once.
 *
 * Each write rewrites the whole `preferences` column after reading it, so several in
 * flight together would let whichever *landed* last decide what is stored — which is
 * not the same as whichever the sailor *tapped* last. Queueing them makes the last
 * tap the last word.
 */
let writes: Promise<void> = Promise.resolve()

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'auto' || value === 'solar' || value === 'nightvision'
}

function isNightTime(): boolean {
  const now = new Date()
  const times = getTimes(now, NAVY_PIER_LAT, NAVY_PIER_LNG)
  const dawn = times.dawn ?? times.sunrise ?? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 6)
  const dusk = times.dusk ?? times.sunset ?? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 20)
  return now < dawn || now > dusk
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'nightvision') return 'nightvision'
  if (preference === 'solar') return 'solar'
  return isNightTime() ? 'nightvision' : 'solar'
}

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return isThemePreference(stored) ? stored : 'auto'
  } catch {
    // Private mode, or storage the browser has refused. The theme still works for
    // this tab; it just will not be remembered for the next one.
    return 'auto'
  }
}

function writeStoredPreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // As above: not remembering is a smaller failure than not theming.
  }
}

/**
 * The only writer of the class, so that the number of screens reading the theme
 * cannot change what the document says. Idempotent, and called on every commit
 * rather than only on a change: the blocking script may have left a class on that
 * this store disagrees with, and that has to be corrected even when nothing here
 * has moved.
 */
function applyThemeClass(theme: ResolvedTheme): void {
  document.documentElement.classList.toggle('theme-nightvision', theme === 'nightvision')
}

/** Running only while the preference is `auto`, since nothing else is time-dependent. */
function syncTimer(): void {
  const wanted = started && snapshot.preference === 'auto'

  if (wanted && !timer) {
    timer = setInterval(() => commit(snapshot.preference), REEVALUATE_INTERVAL_MS)
  } else if (!wanted && timer) {
    clearInterval(timer)
    timer = null
  }
}

function commit(preference: ThemePreference): void {
  const theme = resolveTheme(preference)
  const changed = preference !== snapshot.preference || theme !== snapshot.theme

  if (changed) snapshot = { theme, preference }

  applyThemeClass(theme)
  syncTimer()

  if (changed) subscribers.forEach((notify) => notify())
}

/**
 * Reads storage, puts the class on the document and starts the twilight timer, once
 * per tab. Every entry point calls it, so the store is running whether or not
 * anything is reading from it — the root layout starts it without subscribing,
 * precisely so that a screen nobody reads the theme from still crosses dusk.
 */
function ensureStarted(): void {
  if (started) return
  started = true
  commit(readStoredPreference())
}

/**
 * Runs the theme on this screen, whatever screen it is.
 *
 * Called from the **root** layout, which is the only layout every route has. The
 * chrome is not: `/station/[buoyId]` is outside `app/(app)/`, so a tab opened cold
 * on a station screen used to run no store at all — it kept whatever the blocking
 * script had made of `localStorage`, never adopted the preference on the sailor's
 * **Profile**, and never crossed twilight. The theme only appeared once a routing
 * action took the sailor into the group and mounted the chrome.
 *
 * The question to the **Profile** needs no identity, because `readThemePreference`
 * resolves the sailor itself. What it waits for is the *chrome*, if there is one:
 * a **Guest** the chrome has vouched for is not worth a round trip, and only the
 * chrome knows, having been handed the server-resolved **Account**. A microtask is
 * enough to wait — React runs every effect in a commit before the queue drains —
 * and unlike reading it out of the tree, that does not depend on where this was
 * mounted relative to the chrome. If some later `loading.tsx` or `<Suspense>` above
 * the chrome does put its effect in a later commit, the cost is one wasted question,
 * not a wrong theme: the chrome's answer supersedes an identity-less one.
 *
 * A resolved promise rather than `queueMicrotask` because Jest's fake timers stub
 * the latter, and the twilight suites need those timers.
 *
 * `askProfile: false` runs the theme without asking, for a screen where nobody knows
 * who the sailor is yet — see `useThemeRuntime`.
 */
export function startTheme(options?: { askProfile?: boolean }): void {
  ensureStarted()

  if (options?.askProfile === false) return

  void Promise.resolve().then(() => {
    if (identityAnnounced) return
    readFromProfile(false)
  })
}

export function subscribeToTheme(onStoreChange: () => void): () => void {
  ensureStarted()
  subscribers.add(onStoreChange)
  return () => {
    subscribers.delete(onStoreChange)
  }
}

export function getThemeSnapshot(): ThemeSnapshot {
  return snapshot
}

export function getServerThemeSnapshot(): ThemeSnapshot {
  return SERVER_SNAPSHOT
}

/**
 * The sailor's own choice: applied here and now, then sent to their **Profile** so
 * that the next device they pick up agrees.
 *
 * The screen is not waiting on that round trip, and does not take the choice back if
 * it fails. The sailor asked for this theme and is looking at it; a failed write
 * means only that the *other* device will not know, which is not worth undoing what
 * is in front of them. The reason goes to the console.
 */
export function setThemePreference(preference: ThemePreference): void {
  // Counted even when the value has not changed, because a tap on the theme the
  // sailor is already using is still them saying which theme they want — enough to
  // outrank an answer from the **Profile** that was already on its way, and worth
  // storing so the other device agrees.
  choices += 1
  writeStoredPreference(preference)
  commit(preference)

  if (!accountUserId) return

  storeOnProfile(preference, accountUserId, choices)
}

function storeOnProfile(
  preference: ThemePreference,
  userId: string,
  choice: number
): void {
  writes = writes
    .then(async () => {
      // Superseded by a later tap while this one waited its turn. The older value is
      // already wrong, so it is dropped rather than stored and then corrected.
      if (choice !== choices) return
      // Or superseded by a different sailor. This is no longer their row to write.
      if (userId !== accountUserId) return

      const { ok } = await saveThemePreference(preference)

      if (!ok) {
        console.error('Theme preference: not stored on the Profile; this device only')
      }
    })
    .catch((thrown: unknown) => {
      // A Server Action rejects on a failed round trip — no signal on the dock, a
      // deployment the tab has outlived — as well as returning `{ ok: false }` for a
      // refusal. Caught here or it is an unhandled rejection and, in development, an
      // error overlay over a theme that in fact applied. Caught rather than rethrown
      // also keeps the queue open for every later choice.
      console.error(
        'Theme preference: not stored on the Profile; this device only:',
        thrown instanceof Error ? thrown.message : thrown
      )
    })
}

/**
 * Tells the store who is signed in, and adopts what their **Profile** says.
 *
 * The identity comes from the server prop the chrome already holds (ADR 0018) — the
 * store never asks the browser who the sailor is. The *preference* is not a prop:
 * the server does not own it, and a prop would leave the Settings picker unable to
 * write it. So identity travels down and the preference stays here.
 *
 * Called again whenever the identity changes, which is how a sign-in part way
 * through a tab's life picks up a preference set on another device. Signing out
 * changes no theme: it is not a request to, and `localStorage` still holds whatever
 * the **Profile** last said.
 */
export function syncThemeWithAccount(userId: string | null): void {
  ensureStarted()

  const replaced = identityAnnounced && userId !== accountUserId
  if (identityAnnounced && !replaced) return

  identityAnnounced = true
  accountUserId = userId
  // A sailor in place of a different one: whatever is in flight was asked on behalf
  // of somebody who is no longer here.
  if (replaced) identityGeneration += 1

  // Signing out changes no theme — it is not a request to, and there is nobody left
  // to ask. `localStorage` still holds whatever the **Profile** last said.
  if (!userId) return

  readFromProfile(true)
}

/**
 * Asks the sailor's **Profile** what they chose, once per tab per sailor.
 *
 * Both entry points call it, and either may be the one that gets there first: the
 * root layout runs on every route, the chrome only inside `app/(app)/`. `named` says
 * whether the caller knew who the sailor is — the chrome does, the root layout does
 * not — and a named question is worth asking even where an identity-less one has
 * already been answered, because that answer may have been for nobody.
 *
 * The answer is dropped rather than applied if the sailor has tapped since, or has
 * been replaced, while it was in flight.
 */
function readFromProfile(named: boolean): void {
  const answered = askedGeneration === identityGeneration
  if (answered && (!named || !askedAnonymously)) return
  askedGeneration = identityGeneration
  askedAnonymously = !named

  const asked = choices
  const generation = identityGeneration

  void readThemePreference()
    .then((stored) => {
      // Nothing stored: this sailor has never chosen on any device, so the browser's
      // own memory stands rather than being flattened to `auto`.
      if (stored === null) return

      // The sailor chose while we were asking. Their tap is more recent than this
      // answer and beats it, however slow the round trip was.
      if (choices !== asked) return

      // A slower answer for a sailor who has since been replaced. Applying it would
      // put one sailor's preference on another's screen, and the next tap would then
      // store it on that other sailor's **Profile**. The generation stands in for the
      // id because the question did not carry one.
      if (identityGeneration !== generation) return

      writeStoredPreference(stored)
      commit(stored)
    })
    .catch((thrown: unknown) => {
      // Nothing was answered, so this must not count as the question — a tab that
      // asked while the dock had no signal would otherwise never ask again. Nothing
      // retries on its own; what this allows is the chrome, arriving later, to try.
      if (askedGeneration === generation) askedGeneration = -1

      // `accountUserId` deliberately stays set: a failed read says nothing about
      // whether anybody is signed in, and clearing it would quietly stop this
      // sailor's later choices reaching their Profile. What is lost is only a
      // preference set on another device, this tab.
      console.error(
        'Theme preference: could not be read from the Profile:',
        thrown instanceof Error ? thrown.message : thrown
      )
    })
}

/**
 * Returns the module to the state a freshly opened tab is in.
 *
 * For tests only, and needed because the store is module state: without it each
 * suite would inherit the previous test's preference, subscribers and timer. Follows
 * `clearCache()` in `services/buoys/ndbc.ts`, which exists for the same reason.
 */
export function resetThemeStore(): void {
  if (timer) clearInterval(timer)
  timer = null
  started = false
  subscribers.clear()
  snapshot = SERVER_SNAPSHOT
  accountUserId = null
  identityAnnounced = false
  identityGeneration = 0
  askedGeneration = -1
  askedAnonymously = false
  choices = 0
  writes = Promise.resolve()
}
