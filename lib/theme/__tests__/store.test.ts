import {
  THEME_STORAGE_KEY,
  getServerThemeSnapshot,
  getThemeSnapshot,
  resetThemeStore,
  setThemePreference,
  startTheme,
  subscribeToTheme,
  syncThemeWithAccount,
} from '../store'
import { AFTER_DAWN, AFTER_DUSK, mockSunTimes } from './sunTimes'

jest.mock('suncalc')
jest.mock('../actions', () => ({
  readThemePreference: jest.fn(),
  saveThemePreference: jest.fn(),
}))

const { readThemePreference, saveThemePreference } = jest.requireMock('../actions')

const A_SAILOR = '11111111-1111-1111-1111-111111111111'

function isNightVision(): boolean {
  return document.documentElement.classList.contains('theme-nightvision')
}

/**
 * Lets the store's in-flight talk to the **Profile** settle. Generous, because a
 * queued write is several microtask hops down a chain.
 */
async function settle(): Promise<void> {
  for (let hop = 0; hop < 10; hop += 1) await Promise.resolve()
}

describe('the theme store', () => {
  let localStorageStore: Record<string, string> = {}
  let consoleError: jest.SpyInstance

  beforeEach(() => {
    // The action mocks live in the module factory, so `restoreAllMocks` below does
    // not reach their call history — without this, "never called" means "not called
    // since the suite began".
    jest.clearAllMocks()
    localStorageStore = {}
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(
      (key: string) => localStorageStore[key] ?? null
    )
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(
      (key: string, value: string) => { localStorageStore[key] = value }
    )
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    document.documentElement.className = ''
    readThemePreference.mockResolvedValue(null)
    saveThemePreference.mockResolvedValue({ ok: true })
  })

  afterEach(() => {
    // The store is module state and outlives a test the way it outlives a page
    // navigation, so each test starts from a tab that has just been opened.
    resetThemeStore()
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  describe('one store, however many readers', () => {
    it('hands every subscriber the same preference', () => {
      mockSunTimes({ isNight: false })
      const chrome = jest.fn()
      const settings = jest.fn()
      subscribeToTheme(chrome)
      subscribeToTheme(settings)

      setThemePreference('nightvision')

      expect(chrome).toHaveBeenCalled()
      expect(settings).toHaveBeenCalled()
      expect(getThemeSnapshot()).toEqual({ preference: 'nightvision', theme: 'nightvision' })
    })

    it('returns the same snapshot object until something changes', () => {
      // `useSyncExternalStore` compares snapshots by identity and re-renders every
      // subscriber when they differ, so a fresh object per call would re-render the
      // whole chrome on every render of it.
      mockSunTimes({ isNight: false })
      subscribeToTheme(jest.fn())

      expect(getThemeSnapshot()).toBe(getThemeSnapshot())

      const before = getThemeSnapshot()
      setThemePreference('nightvision')

      expect(getThemeSnapshot()).not.toBe(before)
    })

    it('says nothing when a preference is set to what it already was', () => {
      mockSunTimes({ isNight: false })
      localStorageStore[THEME_STORAGE_KEY] = 'solar'
      const listener = jest.fn()
      subscribeToTheme(listener)

      setThemePreference('solar')

      expect(listener).not.toHaveBeenCalled()
    })

    it('stops telling a subscriber that has gone away', () => {
      mockSunTimes({ isNight: false })
      const listener = jest.fn()
      const unsubscribe = subscribeToTheme(listener)

      unsubscribe()
      setThemePreference('nightvision')

      expect(listener).not.toHaveBeenCalled()
    })

    it('renders `auto` as of the server for hydration, not as of the server’s clock', () => {
      // The server does not know what time it is where the sailor is, and the
      // blocking script in `app/layout.tsx` has already put the right class on the
      // document before React runs. So the hydrating snapshot is a constant, and the
      // first commit after hydration corrects it.
      mockSunTimes({ isNight: true })

      expect(getServerThemeSnapshot()).toEqual({ preference: 'auto', theme: 'solar' })
      expect(getServerThemeSnapshot()).toBe(getServerThemeSnapshot())
    })
  })

  describe('localStorage', () => {
    it('reads the stored preference on the first subscription', () => {
      mockSunTimes({ isNight: false })
      localStorageStore[THEME_STORAGE_KEY] = 'nightvision'

      subscribeToTheme(jest.fn())

      expect(getThemeSnapshot()).toEqual({ preference: 'nightvision', theme: 'nightvision' })
    })

    it('falls back to auto when nothing is stored, and when what is stored is not a preference', () => {
      mockSunTimes({ isNight: true })
      localStorageStore[THEME_STORAGE_KEY] = 'sepia'

      subscribeToTheme(jest.fn())

      expect(getThemeSnapshot()).toEqual({ preference: 'auto', theme: 'nightvision' })
    })

    it('writes the preference through on every change', () => {
      mockSunTimes({ isNight: false })
      subscribeToTheme(jest.fn())

      setThemePreference('nightvision')

      expect(localStorageStore[THEME_STORAGE_KEY]).toBe('nightvision')
    })
  })

  describe('the document class, written in one place', () => {
    it('adds the class when the resolved theme is nightvision', () => {
      mockSunTimes({ isNight: true })

      subscribeToTheme(jest.fn())

      expect(isNightVision()).toBe(true)
    })

    it('removes a class the blocking script left behind when the theme is solar', () => {
      document.documentElement.classList.add('theme-nightvision')
      mockSunTimes({ isNight: false })

      subscribeToTheme(jest.fn())

      expect(isNightVision()).toBe(false)
    })

    it('writes the class with no subscriber at all', () => {
      // The chrome asks the store to start without reading from it, so that a screen
      // nobody has subscribed from still crosses twilight.
      mockSunTimes({ isNight: true })

      syncThemeWithAccount(null)

      expect(isNightVision()).toBe(true)
    })
  })

  describe('every screen, chrome or not', () => {
    // LAY-52 follow-up: the store used to be started only by the chrome, which is
    // `app/(app)/layout.tsx` alone. A tab opened cold on `/station/[buoyId]` — a
    // live route outside that group — therefore ran no store at all: it kept
    // whatever the blocking script had worked out from `localStorage`, never
    // adopted the preference on the sailor's **Profile**, and never crossed
    // twilight. The theme only appeared once a routing action took the sailor into
    // the group and mounted the chrome. `startTheme()` runs from the root layout,
    // which every route has.

    it('adopts the Profile’s preference without being told who the sailor is', async () => {
      // The Server Action resolves the sailor itself, so a screen with no chrome to
      // hand an id down can still be given the preference chosen on another device.
      mockSunTimes({ isNight: false })
      localStorageStore[THEME_STORAGE_KEY] = 'solar'
      readThemePreference.mockResolvedValue('nightvision')

      startTheme()
      await settle()

      expect(getThemeSnapshot()).toEqual({ preference: 'nightvision', theme: 'nightvision' })
      expect(isNightVision()).toBe(true)
      expect(localStorageStore[THEME_STORAGE_KEY]).toBe('nightvision')
    })

    it('crosses twilight on a screen the chrome never wrapped', () => {
      mockSunTimes({ isNight: false })

      startTheme()
      jest.setSystemTime(AFTER_DUSK)
      jest.advanceTimersByTime(60_000)

      expect(isNightVision()).toBe(true)
    })

    it('asks the Profile once when there is a chrome as well', async () => {
      // Both entry points run on a route inside the group. One tab, one question —
      // and the chrome's answer is the one that arrives, since it knows whether
      // there is anybody to ask.
      mockSunTimes({ isNight: false })

      startTheme()
      syncThemeWithAccount(A_SAILOR)
      await settle()

      expect(readThemePreference).toHaveBeenCalledTimes(1)
    })

    it('asks nothing at all when the chrome says the sailor is a Guest', async () => {
      // The store cannot tell a **Guest** from a sailor, but the chrome can — it was
      // handed the server-resolved **Account**. So on a route that has chrome, its
      // word saves the round trip; `startTheme` waits for it before asking.
      mockSunTimes({ isNight: false })

      startTheme()
      syncThemeWithAccount(null)
      await settle()

      expect(readThemePreference).not.toHaveBeenCalled()
    })

    it('asks again when the chrome names a sailor the first question could not have been for', async () => {
      // Signing in. `/auth/callback` is outside `app/(app)/` too, so the store asks
      // while the browser is still exchanging the code — nobody is signed in yet and
      // the answer is `null`. `CompleteSignIn` then routes onward without a document
      // load, so this same module state meets the chrome, which finally knows who the
      // sailor is. A question asked on behalf of nobody cannot stand as their answer.
      mockSunTimes({ isNight: false })

      startTheme()
      await settle()
      readThemePreference.mockResolvedValue('nightvision')
      syncThemeWithAccount(A_SAILOR)
      await settle()

      expect(readThemePreference).toHaveBeenCalledTimes(2)
      expect(getThemeSnapshot().preference).toBe('nightvision')
    })

    it('does not ask again when the chrome then says the sailor is a Guest', async () => {
      // The other half of the above: the chrome adds nothing an identity-less
      // question did not already have, so there is nothing to ask twice.
      mockSunTimes({ isNight: false })

      startTheme()
      await settle()
      syncThemeWithAccount(null)
      await settle()

      expect(readThemePreference).toHaveBeenCalledTimes(1)
    })

    it('does not ask a third time once the chrome has named the sailor', async () => {
      mockSunTimes({ isNight: false })

      startTheme()
      await settle()
      syncThemeWithAccount(A_SAILOR)
      await settle()
      syncThemeWithAccount(A_SAILOR)
      await settle()

      expect(readThemePreference).toHaveBeenCalledTimes(2)
    })

    it('leaves a failed question able to be asked again', async () => {
      // No signal on the dock. The read rejects, and the tab must not be left unable
      // to ever ask — the chrome naming the sailor is a fresh occasion to try.
      mockSunTimes({ isNight: false })
      readThemePreference.mockRejectedValueOnce(new Error('offline'))

      startTheme()
      await settle()
      readThemePreference.mockResolvedValue('nightvision')
      syncThemeWithAccount(A_SAILOR)
      await settle()

      expect(getThemeSnapshot().preference).toBe('nightvision')
      expect(consoleError).toHaveBeenCalled()
    })

    it('runs the theme without asking, where nobody knows who the sailor is yet', async () => {
      // `/auth/callback`, mid-handshake: the class and the twilight timer still
      // belong on the screen, but a question now would answer for nobody and put a
      // request alongside the code exchange.
      mockSunTimes({ isNight: true })

      startTheme({ askProfile: false })
      await settle()

      expect(readThemePreference).not.toHaveBeenCalled()
      expect(isNightVision()).toBe(true)
    })

    it('asks once the chrome names the sailor, after a screen that did not ask', async () => {
      mockSunTimes({ isNight: false })
      readThemePreference.mockResolvedValue('nightvision')

      startTheme({ askProfile: false })
      await settle()
      syncThemeWithAccount(A_SAILOR)
      await settle()

      expect(readThemePreference).toHaveBeenCalledTimes(1)
      expect(getThemeSnapshot().preference).toBe('nightvision')
    })

    it('asks again when a different sailor signs in on that tab', async () => {
      mockSunTimes({ isNight: false })
      startTheme()
      await settle()
      syncThemeWithAccount(A_SAILOR)

      readThemePreference.mockResolvedValue('nightvision')
      syncThemeWithAccount('22222222-2222-2222-2222-222222222222')
      await settle()

      expect(getThemeSnapshot().preference).toBe('nightvision')
    })

    it('does not apply an identity-less answer once the sailor has been replaced', async () => {
      // An identity-less question carries no id, so when a slow one lands there is
      // nothing to compare it against; the generation is what tells the store the
      // answer belongs to nobody who is still here.
      mockSunTimes({ isNight: false })
      let answerBlind: (preference: string | null) => void = () => {}
      readThemePreference.mockReturnValueOnce(
        new Promise((resolve) => { answerBlind = resolve })
      )
      readThemePreference.mockResolvedValueOnce('solar')

      startTheme()
      await settle()
      // The chrome names the sailor: 'solar' is theirs, and lands.
      syncThemeWithAccount(A_SAILOR)
      await settle()
      // Then somebody else signs in on this tab, and has chosen nothing.
      syncThemeWithAccount('22222222-2222-2222-2222-222222222222')
      await settle()
      answerBlind('nightvision')
      await settle()

      expect(getThemeSnapshot().preference).toBe('solar')
    })
  })

  describe('crossing twilight', () => {
    it('re-resolves auto on the interval', () => {
      mockSunTimes({ isNight: false })
      subscribeToTheme(jest.fn())
      expect(getThemeSnapshot().theme).toBe('solar')

      jest.setSystemTime(AFTER_DUSK)
      jest.advanceTimersByTime(60_000)

      expect(getThemeSnapshot().theme).toBe('nightvision')
      expect(isNightVision()).toBe(true)
    })

    it('leaves an explicit preference alone across every later crossing', () => {
      // LAY-128: the bug was a second `useTheme` instance still holding `auto` and
      // re-asserting time-based theming at the next dawn, undoing the choice. With
      // one store there is no second holder, and the timer is not running at all.
      mockSunTimes({ isNight: true })
      subscribeToTheme(jest.fn())

      setThemePreference('nightvision')

      jest.setSystemTime(AFTER_DAWN)
      jest.advanceTimersByTime(60_000 * 60 * 48)

      expect(getThemeSnapshot()).toEqual({ preference: 'nightvision', theme: 'nightvision' })
      expect(isNightVision()).toBe(true)
    })

    it('leaves an explicit solar alone across the following dusk', () => {
      mockSunTimes({ isNight: false })
      subscribeToTheme(jest.fn())

      setThemePreference('solar')

      jest.setSystemTime(AFTER_DUSK)
      jest.advanceTimersByTime(60_000 * 60 * 48)

      expect(getThemeSnapshot()).toEqual({ preference: 'solar', theme: 'solar' })
      expect(isNightVision()).toBe(false)
    })

    it('picks the timer back up when the sailor returns to auto', () => {
      mockSunTimes({ isNight: false })
      subscribeToTheme(jest.fn())
      setThemePreference('solar')

      setThemePreference('auto')
      jest.setSystemTime(AFTER_DUSK)
      jest.advanceTimersByTime(60_000)

      expect(getThemeSnapshot().theme).toBe('nightvision')
    })
  })

  describe('the Profile, for a signed-in sailor', () => {
    it('takes the stored preference over a stale localStorage, and mirrors it back', async () => {
      // The laptop's browser remembers a choice made months ago; the phone has since
      // set Night Vision. The **Profile** is the one that travels, so it wins.
      mockSunTimes({ isNight: false })
      localStorageStore[THEME_STORAGE_KEY] = 'solar'
      readThemePreference.mockResolvedValue('nightvision')
      subscribeToTheme(jest.fn())

      syncThemeWithAccount(A_SAILOR)
      await settle()

      expect(getThemeSnapshot()).toEqual({ preference: 'nightvision', theme: 'nightvision' })
      expect(isNightVision()).toBe(true)
      expect(localStorageStore[THEME_STORAGE_KEY]).toBe('nightvision')
    })

    it('keeps what the browser has when the sailor has never chosen on any device', async () => {
      mockSunTimes({ isNight: false })
      localStorageStore[THEME_STORAGE_KEY] = 'nightvision'
      readThemePreference.mockResolvedValue(null)
      subscribeToTheme(jest.fn())

      syncThemeWithAccount(A_SAILOR)
      await settle()

      expect(getThemeSnapshot().preference).toBe('nightvision')
      expect(localStorageStore[THEME_STORAGE_KEY]).toBe('nightvision')
    })

    it('does not undo a choice the sailor made while the read was in flight', async () => {
      mockSunTimes({ isNight: false })
      let answer: (preference: string | null) => void = () => {}
      readThemePreference.mockReturnValue(new Promise((resolve) => { answer = resolve }))
      subscribeToTheme(jest.fn())

      syncThemeWithAccount(A_SAILOR)
      setThemePreference('solar')
      answer('nightvision')
      await settle()

      // The sailor is looking at Solar and asked for it a moment ago. A round trip
      // that started before the tap does not get to overrule the tap.
      expect(getThemeSnapshot().preference).toBe('solar')
      expect(localStorageStore[THEME_STORAGE_KEY]).toBe('solar')
    })

    it('writes a change to the Profile as well as the browser', async () => {
      mockSunTimes({ isNight: false })
      subscribeToTheme(jest.fn())
      syncThemeWithAccount(A_SAILOR)
      await settle()

      setThemePreference('nightvision')

      // localStorage and the screen are immediate; the Profile is a queued round trip.
      expect(localStorageStore[THEME_STORAGE_KEY]).toBe('nightvision')

      await settle()

      expect(saveThemePreference).toHaveBeenCalledWith('nightvision')
    })

    it('keeps the sailor’s screen when the write is refused, and logs', async () => {
      // The preference is theirs and the screen already obeys it. A failed round trip
      // means it will not be on the other device, which is not worth taking the
      // chosen theme back off the screen they are looking at.
      mockSunTimes({ isNight: false })
      saveThemePreference.mockResolvedValue({ ok: false })
      subscribeToTheme(jest.fn())
      syncThemeWithAccount(A_SAILOR)
      await settle()

      setThemePreference('nightvision')
      await settle()

      expect(getThemeSnapshot().preference).toBe('nightvision')
      expect(isNightVision()).toBe(true)
      expect(consoleError).toHaveBeenCalled()
    })

    it('stores only the last of a run of quick taps', async () => {
      // Each write rewrites the whole `preferences` column after reading it, so three
      // in flight at once would let whichever landed last decide — and that is not
      // the same as whichever the sailor tapped last. Queued, and the superseded ones
      // are dropped rather than sent.
      mockSunTimes({ isNight: false })
      subscribeToTheme(jest.fn())
      syncThemeWithAccount(A_SAILOR)
      await settle()

      setThemePreference('auto')
      setThemePreference('solar')
      setThemePreference('nightvision')
      await settle()

      expect(saveThemePreference).toHaveBeenCalledTimes(1)
      expect(saveThemePreference).toHaveBeenCalledWith('nightvision')
    })

    it('sends each of two taps the sailor made a moment apart', async () => {
      mockSunTimes({ isNight: false })
      subscribeToTheme(jest.fn())
      syncThemeWithAccount(A_SAILOR)
      await settle()

      setThemePreference('solar')
      await settle()
      setThemePreference('nightvision')
      await settle()

      expect(saveThemePreference.mock.calls).toEqual([['solar'], ['nightvision']])
    })

    it('survives a write that never reaches the server, and keeps the screen', async () => {
      // A Server Action rejects on a failed round trip — no signal on the dock, a
      // stale deployment — rather than returning `{ ok: false }`. Unhandled, that is
      // an `unhandledrejection` and an error overlay in development.
      mockSunTimes({ isNight: false })
      saveThemePreference.mockRejectedValue(new Error('Failed to fetch'))
      subscribeToTheme(jest.fn())
      syncThemeWithAccount(A_SAILOR)
      await settle()

      setThemePreference('nightvision')
      await settle()

      expect(getThemeSnapshot().preference).toBe('nightvision')
      expect(isNightVision()).toBe(true)
      expect(consoleError).toHaveBeenCalled()
    })

    it('still sends the next tap after a write that failed', async () => {
      mockSunTimes({ isNight: false })
      saveThemePreference.mockRejectedValueOnce(new Error('Failed to fetch'))
      subscribeToTheme(jest.fn())
      syncThemeWithAccount(A_SAILOR)
      await settle()

      setThemePreference('solar')
      await settle()
      setThemePreference('nightvision')
      await settle()

      // One rejection must not break the queue every later choice goes through.
      expect(saveThemePreference).toHaveBeenLastCalledWith('nightvision')
    })

    it('survives a read that never reaches the server, and still writes later choices', async () => {
      mockSunTimes({ isNight: false })
      readThemePreference.mockRejectedValue(new Error('Failed to fetch'))
      subscribeToTheme(jest.fn())

      syncThemeWithAccount(A_SAILOR)
      await settle()

      expect(consoleError).toHaveBeenCalled()

      // The failed read says nothing about whether this sailor is signed in, so their
      // Profile is still where a choice belongs.
      setThemePreference('nightvision')
      await settle()

      expect(saveThemePreference).toHaveBeenCalledWith('nightvision')
    })

    it('does not apply one sailor’s preference to the sailor who replaced them', async () => {
      // A multi-tab sign-out and sign-in re-renders the chrome with a new id, so two
      // reads can be in flight in one tab. The slower one belongs to nobody now.
      mockSunTimes({ isNight: false })
      let answerFirst: (preference: string | null) => void = () => {}
      readThemePreference.mockReturnValueOnce(
        new Promise((resolve) => { answerFirst = resolve })
      )
      readThemePreference.mockResolvedValueOnce('solar')
      subscribeToTheme(jest.fn())

      syncThemeWithAccount(A_SAILOR)
      syncThemeWithAccount('22222222-2222-2222-2222-222222222222')
      await settle()
      answerFirst('nightvision')
      await settle()

      expect(getThemeSnapshot().preference).toBe('solar')
      expect(localStorageStore[THEME_STORAGE_KEY]).toBe('solar')
    })

    it('re-reads when a different sailor signs in on the same tab', async () => {
      mockSunTimes({ isNight: false })
      subscribeToTheme(jest.fn())
      syncThemeWithAccount(A_SAILOR)
      await settle()

      readThemePreference.mockResolvedValue('nightvision')
      syncThemeWithAccount('22222222-2222-2222-2222-222222222222')
      await settle()

      expect(getThemeSnapshot().preference).toBe('nightvision')
    })

    it('does not re-read for the same sailor twice', async () => {
      mockSunTimes({ isNight: false })
      subscribeToTheme(jest.fn())

      syncThemeWithAccount(A_SAILOR)
      await settle()
      syncThemeWithAccount(A_SAILOR)
      await settle()

      expect(readThemePreference).toHaveBeenCalledTimes(1)
    })
  })

  describe('a Guest', () => {
    it('never touches the Profile, in either direction', async () => {
      mockSunTimes({ isNight: false })
      subscribeToTheme(jest.fn())
      syncThemeWithAccount(null)
      await settle()

      setThemePreference('nightvision')
      await settle()

      expect(readThemePreference).not.toHaveBeenCalled()
      expect(saveThemePreference).not.toHaveBeenCalled()
      expect(localStorageStore[THEME_STORAGE_KEY]).toBe('nightvision')
    })

    it('is who a choice is stored for until the chrome names a sailor', async () => {
      // Nothing has called `syncThemeWithAccount`, so the store has never been told
      // there is a sailor. It can still *read* the **Profile** without being told —
      // `startTheme` does, and the Server Action resolves the sailor itself — but a
      // write needs an id, so this is localStorage only. The honest degradation, and
      // a narrow window: the chrome announces on its first commit.
      mockSunTimes({ isNight: false })
      subscribeToTheme(jest.fn())

      setThemePreference('nightvision')
      await settle()

      expect(saveThemePreference).not.toHaveBeenCalled()
      expect(localStorageStore[THEME_STORAGE_KEY]).toBe('nightvision')
    })

    it('keeps the preference on the screen when signing out', async () => {
      mockSunTimes({ isNight: false })
      readThemePreference.mockResolvedValue('nightvision')
      subscribeToTheme(jest.fn())
      syncThemeWithAccount(A_SAILOR)
      await settle()

      syncThemeWithAccount(null)
      await settle()

      // Signing out is not a request to change the theme, and localStorage still
      // holds what the **Profile** last said.
      expect(getThemeSnapshot().preference).toBe('nightvision')
    })
  })
})
