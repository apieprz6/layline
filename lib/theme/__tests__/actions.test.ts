import { readThemePreference, saveThemePreference } from '../actions'
import { CREW } from '@/__tests__/fixtures/accounts'

const selectMaybeSingle = jest.fn()
const selectEq = jest.fn(() => ({ maybeSingle: selectMaybeSingle }))
const select = jest.fn(() => ({ eq: selectEq }))
const updateEq = jest.fn()
const update = jest.fn(() => ({ eq: updateEq }))

const from = jest.fn((table: string) => {
  if (table !== 'profiles') throw new Error(`the theme preference touched ${table}`)
  return { select, update }
})

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/account/resolveAccount', () => ({ resolveAccount: jest.fn() }))

const { createClient } = jest.requireMock('@/lib/supabase/server')
const { resolveAccount } = jest.requireMock('@/lib/account/resolveAccount')

/** What a sailor who has used the buoy settings already has in the column. */
const EXISTING_DATA_SOURCES = {
  dataSources: {
    chii2: { enabled: true, displayName: 'Harrison Dever Crib' },
    45198: { enabled: false, displayName: 'Purdue Buoy' },
  },
}

describe('the theme preference on the server', () => {
  let consoleError: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    createClient.mockResolvedValue({ from })
    resolveAccount.mockResolvedValue(CREW)
    selectMaybeSingle.mockResolvedValue({ data: { preferences: {} }, error: null })
    updateEq.mockResolvedValue({ error: null })
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  describe('readThemePreference', () => {
    it('returns the preference stored on the sailor’s own Profile', async () => {
      selectMaybeSingle.mockResolvedValue({
        data: { preferences: { ...EXISTING_DATA_SOURCES, theme: 'nightvision' } },
        error: null,
      })

      await expect(readThemePreference()).resolves.toBe('nightvision')

      expect(select).toHaveBeenCalledWith('preferences')
      expect(selectEq).toHaveBeenCalledWith('user_id', CREW.userId)
    })

    it('returns null for a Guest, and reads nothing', async () => {
      resolveAccount.mockResolvedValue(null)

      await expect(readThemePreference()).resolves.toBeNull()

      expect(from).not.toHaveBeenCalled()
    })

    it('returns null when the sailor has never chosen on any device', async () => {
      selectMaybeSingle.mockResolvedValue({
        data: { preferences: EXISTING_DATA_SOURCES },
        error: null,
      })

      await expect(readThemePreference()).resolves.toBeNull()
    })

    it('returns null rather than a guess when the column holds something else', async () => {
      // A hand-edited row, or a value written by a future version of the app. An
      // unreadable preference is a preference we do not have, not `auto`.
      selectMaybeSingle.mockResolvedValue({
        data: { preferences: { theme: 'sepia' } },
        error: null,
      })

      await expect(readThemePreference()).resolves.toBeNull()
    })

    it('returns null and logs when the read fails', async () => {
      selectMaybeSingle.mockResolvedValue({
        data: null,
        error: { message: 'permission denied for table profiles' },
      })

      await expect(readThemePreference()).resolves.toBeNull()

      expect(consoleError).toHaveBeenCalled()
    })

    it('returns null when there is no Supabase environment', async () => {
      createClient.mockRejectedValue(new Error('Missing Supabase environment variables.'))

      await expect(readThemePreference()).resolves.toBeNull()

      expect(consoleError).toHaveBeenCalled()
    })
  })

  describe('saveThemePreference', () => {
    it('writes the theme beside whatever else the column already held', async () => {
      selectMaybeSingle.mockResolvedValue({
        data: { preferences: EXISTING_DATA_SOURCES },
        error: null,
      })

      await expect(saveThemePreference('nightvision')).resolves.toEqual({ ok: true })

      // The whole column is rewritten, so the buoy settings have to be carried
      // across: a write that dropped them would overwrite what the sailor set on
      // another screen.
      expect(update).toHaveBeenCalledWith({
        preferences: { ...EXISTING_DATA_SOURCES, theme: 'nightvision' },
      })
      expect(updateEq).toHaveBeenCalledWith('user_id', CREW.userId)
    })

    it('replaces a theme the column already carried', async () => {
      selectMaybeSingle.mockResolvedValue({
        data: { preferences: { theme: 'solar' } },
        error: null,
      })

      await expect(saveThemePreference('auto')).resolves.toEqual({ ok: true })

      expect(update).toHaveBeenCalledWith({ preferences: { theme: 'auto' } })
    })

    it('refuses a Guest, and writes nothing', async () => {
      resolveAccount.mockResolvedValue(null)

      await expect(saveThemePreference('nightvision')).resolves.toEqual({ ok: false })

      expect(update).not.toHaveBeenCalled()
    })

    it('lets a viewer write their own theme', async () => {
      // Deliberately not `canWrite`: that predicate is about the boat, which only an
      // admin edits (ADR 0019). This is the sailor's own row, and every signed-in
      // sailor owns their own screen.
      resolveAccount.mockResolvedValue({ ...CREW, role: 'viewer' })

      await expect(saveThemePreference('solar')).resolves.toEqual({ ok: true })

      expect(update).toHaveBeenCalled()
    })

    it('refuses a value that is not a theme preference, before authenticating', async () => {
      // A Server Action is a public endpoint, so the three values are checked here
      // and not only in the picker that offers them.
      await expect(
        saveThemePreference('DROP TABLE profiles' as never)
      ).resolves.toEqual({ ok: false })

      expect(resolveAccount).not.toHaveBeenCalled()
      expect(update).not.toHaveBeenCalled()
    })

    it('reports failure and logs when the update is refused', async () => {
      updateEq.mockResolvedValue({ error: { message: 'new row violates row-level security' } })

      await expect(saveThemePreference('nightvision')).resolves.toEqual({ ok: false })

      expect(consoleError).toHaveBeenCalled()
    })

    it('reports failure and writes nothing when the row cannot be read first', async () => {
      // Without the existing column there is no way to merge into it, and writing
      // `{ theme }` alone would silently drop the sailor's buoy settings.
      selectMaybeSingle.mockResolvedValue({
        data: null,
        error: { message: 'permission denied for table profiles' },
      })

      await expect(saveThemePreference('nightvision')).resolves.toEqual({ ok: false })

      expect(update).not.toHaveBeenCalled()
      expect(consoleError).toHaveBeenCalled()
    })

    it('reports failure when the Profile the trigger promised is missing', async () => {
      selectMaybeSingle.mockResolvedValue({ data: null, error: null })

      await expect(saveThemePreference('nightvision')).resolves.toEqual({ ok: false })

      expect(update).not.toHaveBeenCalled()
      expect(consoleError).toHaveBeenCalled()
    })
  })
})
