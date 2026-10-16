/**
 * @jest-environment node
 */

import { saveBoatIdentity } from '../actions'
import { CREW } from '@/__tests__/fixtures/accounts'

const boatMaybeSingle = jest.fn()
const updateEq = jest.fn()
const update = jest.fn(() => ({ eq: updateEq }))

const from = jest.fn((table: string) => {
  if (table !== 'boats') throw new Error(`saveBoatIdentity touched ${table}`)
  return { select: () => ({ maybeSingle: boatMaybeSingle }), update }
})

const upload = jest.fn()
const remove = jest.fn()
const storageFrom = jest.fn(() => ({ upload, remove }))

const createClient = jest.fn(async () => ({ from, storage: { from: storageFrom } }))

jest.mock('@/lib/supabase/server', () => ({ createClient: () => createClient() }))
jest.mock('@/lib/account/resolveAccount', () => ({ resolveAccount: jest.fn() }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

const { resolveAccount } = jest.requireMock('@/lib/account/resolveAccount')
const { revalidatePath } = jest.requireMock('next/cache')

const ADMIN = { ...CREW, role: 'admin' as const }

function form(fields: Record<string, string | File>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.append(key, value)
  return data
}

/** A PNG's eight-byte signature and the start of its IHDR chunk — enough to be one. */
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16])
const WEBP_BYTES = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
])

function icon(bytes: Uint8Array<ArrayBuffer>, name = 'pete.png', type = 'image/png'): File {
  return new File([bytes], name, { type })
}

/** The boat as it is before the save: with an icon, unless a test says otherwise. */
const OLD_ICON_PATH = 'boat-identity/icon/old.png'

/** What the two inputs would carry if nobody touched them. */
const AS_IS = { name: 'Handsome Pete', model: 'Beneteau 10R' }

/** Nothing was written and nothing was claimed to have been. */
function expectNoWrite() {
  expect(update).not.toHaveBeenCalled()
  expect(revalidatePath).not.toHaveBeenCalled()
}

describe('saveBoatIdentity', () => {
  let consoleError: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    resolveAccount.mockResolvedValue(ADMIN)
    boatMaybeSingle.mockResolvedValue({ data: { id: 'boat-1', icon_path: null }, error: null })
    updateEq.mockResolvedValue({ error: null })
    upload.mockResolvedValue({ data: { path: 'x' }, error: null })
    remove.mockResolvedValue({ data: [], error: null })
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it('writes an admin’s edit to the boat and revalidates the screen', async () => {
    await expect(saveBoatIdentity(form({ name: 'Bruiser', model: 'J/105' }))).resolves.toEqual(
      { ok: true }
    )

    expect(update).toHaveBeenCalledWith({ name: 'Bruiser', model: 'J/105' })
    expect(updateEq).toHaveBeenCalledWith('id', 'boat-1')
    // The layout, not just the screen: the header on every screen names the boat.
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('refuses a viewer, and writes nothing', async () => {
    // ADR 0019: every signed-in sailor reads the boat; only an admin writes it. RLS
    // would refuse this too, but a Server Action is a public endpoint and has to
    // refuse it on its own — the client hiding the pencil is not the check.
    resolveAccount.mockResolvedValue({ ...CREW, role: 'viewer' })

    const result = await saveBoatIdentity(form({ name: 'Bruiser', model: 'J/105' }))

    expect(result.ok).toBe(false)
    expectNoWrite()
  })

  it('refuses a Guest, and writes nothing', async () => {
    resolveAccount.mockResolvedValue(null)

    const result = await saveBoatIdentity(form({ name: 'Bruiser', model: 'J/105' }))

    expect(result.ok).toBe(false)
    expectNoWrite()
  })

  it('refuses to blank the name, and says which field it refused', async () => {
    // A boat with no name is not a record of anything, and the header *is* the
    // boat's identity — there would be nothing left to render.
    const result = await saveBoatIdentity(form({ ...AS_IS, name: '   ' }))

    expect(result).toEqual({ ok: false, message: expect.stringMatching(/name/i) })
    expectNoWrite()
  })

  it('refuses to blank the model, and says which field it refused', async () => {
    const result = await saveBoatIdentity(form({ ...AS_IS, model: '' }))

    expect(result).toEqual({ ok: false, message: expect.stringMatching(/model/i) })
    expectNoWrite()
  })

  it('refuses a form that carries no fields at all', async () => {
    const result = await saveBoatIdentity(form({}))

    expect(result.ok).toBe(false)
    expectNoWrite()
  })

  it('stores the name and model without the whitespace around them', async () => {
    await saveBoatIdentity(form({ name: '  Handsome Pete  ', model: ' Beneteau 10R ' }))

    expect(update).toHaveBeenCalledWith({ name: 'Handsome Pete', model: 'Beneteau 10R' })
  })

  it('updates the boat it read itself, never one the form named', async () => {
    // The singleton is read server-side on every call. A form-supplied id would be
    // an id the caller chose, and `boats` has exactly one row that anyone may mean.
    await saveBoatIdentity(form({ ...AS_IS, boatId: '00000000-0000-0000-0000-000000000000' }))

    expect(updateEq).toHaveBeenCalledWith('id', 'boat-1')
    expect(updateEq).toHaveBeenCalledTimes(1)
  })

  it('reports a refused write rather than claiming it landed', async () => {
    // RLS refusing an admin whose Profile says otherwise, or any other write error.
    updateEq.mockResolvedValue({ error: { message: 'new row violates row-level security policy' } })

    const result = await saveBoatIdentity(form(AS_IS))

    expect(result.ok).toBe(false)
    expect(revalidatePath).not.toHaveBeenCalled()
    expect(consoleError).toHaveBeenCalled()
  })

  it('refuses when there is no boat row to write to', async () => {
    boatMaybeSingle.mockResolvedValue({ data: null, error: null })

    const result = await saveBoatIdentity(form(AS_IS))

    expect(result.ok).toBe(false)
    expectNoWrite()
  })

  it('refuses when there is no Supabase environment to write to', async () => {
    createClient.mockRejectedValueOnce(new Error('Missing Supabase environment variables.'))

    const result = await saveBoatIdentity(form(AS_IS))

    expect(result.ok).toBe(false)
    expect(revalidatePath).not.toHaveBeenCalled()
    expect(consoleError).toHaveBeenCalled()
  })

  describe('the icon', () => {
    beforeEach(() => {
      jest.useFakeTimers({ now: new Date('2026-10-16T18:00:00.000Z'), doNotFake: ['nextTick'] })
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('stores an uploaded icon’s bytes exactly as given, beside the name and model', async () => {
      const result = await saveBoatIdentity(form({ ...AS_IS, icon: icon(PNG_BYTES) }))

      expect(result).toEqual({ ok: true })
      expect(storageFrom).toHaveBeenCalledWith('boat')
      expect(upload).toHaveBeenCalledWith('boat-identity/icon/pete.png', PNG_BYTES, {
        upsert: true,
        contentType: 'image/png',
      })
      expect(update).toHaveBeenCalledWith({
        ...AS_IS,
        icon_path: 'boat-identity/icon/pete.png',
        icon_updated_at: '2026-10-16T18:00:00.000Z',
      })
    })

    it.each([
      ['JPEG', JPEG_BYTES, 'image/jpeg'],
      ['WebP', WEBP_BYTES, 'image/webp'],
    ])('accepts a %s, typed by its bytes', async (_name, bytes, type) => {
      // Reported as nothing at all: the browser's word is not what decides.
      const result = await saveBoatIdentity(
        form({ ...AS_IS, icon: icon(bytes, 'pete.img', '') })
      )

      expect(result).toEqual({ ok: true })
      expect(upload).toHaveBeenCalledWith(
        'boat-identity/icon/pete.img',
        bytes,
        expect.objectContaining({ contentType: type })
      )
    })

    it('refuses an SVG even when the browser calls it a PNG, and writes nothing', async () => {
      // An SVG is a document and can carry script; serving one from our origin is the risk.
      const svg = new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
      )

      const result = await saveBoatIdentity(form({ ...AS_IS, icon: icon(svg, 'pete.png') }))

      expect(result).toEqual({ ok: false, message: expect.stringMatching(/PNG, JPEG or WebP/) })
      expect(upload).not.toHaveBeenCalled()
      expectNoWrite()
    })

    it('refuses a GIF, and writes nothing', async () => {
      const gif = new TextEncoder().encode('GIF89a\x01\x00')

      const result = await saveBoatIdentity(form({ ...AS_IS, icon: icon(gif, 'pete.gif', 'image/gif') }))

      expect(result.ok).toBe(false)
      expect(upload).not.toHaveBeenCalled()
      expectNoWrite()
    })

    it('refuses an icon over a megabyte, and writes nothing', async () => {
      const big = new Uint8Array(1_048_577)
      big.set(PNG_BYTES)

      const result = await saveBoatIdentity(form({ ...AS_IS, icon: icon(big) }))

      expect(result).toEqual({ ok: false, message: expect.stringMatching(/1 MB/) })
      expect(upload).not.toHaveBeenCalled()
      expectNoWrite()
    })

    it('refuses a viewer’s icon before reading a byte of it', async () => {
      resolveAccount.mockResolvedValue({ ...CREW, role: 'viewer' })

      const result = await saveBoatIdentity(form({ ...AS_IS, icon: icon(PNG_BYTES) }))

      expect(result.ok).toBe(false)
      expect(upload).not.toHaveBeenCalled()
      expect(remove).not.toHaveBeenCalled()
      expectNoWrite()
    })

    it('deletes the icon it replaced — there is only ever one', async () => {
      boatMaybeSingle.mockResolvedValue({
        data: { id: 'boat-1', icon_path: OLD_ICON_PATH },
        error: null,
      })

      await saveBoatIdentity(form({ ...AS_IS, icon: icon(PNG_BYTES) }))

      expect(remove).toHaveBeenCalledWith([OLD_ICON_PATH])
      // Only once the row points at the new one, so a failed save never leaves it pointing at nothing.
      expect(remove.mock.invocationCallOrder[0]).toBeGreaterThan(
        updateEq.mock.invocationCallOrder[0]
      )
    })

    it('does not delete a replacement uploaded under the same name as the icon it replaced', async () => {
      boatMaybeSingle.mockResolvedValue({
        data: { id: 'boat-1', icon_path: 'boat-identity/icon/pete.png' },
        error: null,
      })

      await saveBoatIdentity(form({ ...AS_IS, icon: icon(PNG_BYTES) }))

      expect(remove).not.toHaveBeenCalled()
    })

    it('removes the icon: clears both columns, then deletes the object', async () => {
      boatMaybeSingle.mockResolvedValue({
        data: { id: 'boat-1', icon_path: OLD_ICON_PATH },
        error: null,
      })

      const result = await saveBoatIdentity(form({ ...AS_IS, removeIcon: 'true' }))

      expect(result).toEqual({ ok: true })
      expect(upload).not.toHaveBeenCalled()
      expect(update).toHaveBeenCalledWith({ ...AS_IS, icon_path: null, icon_updated_at: null })
      expect(remove).toHaveBeenCalledWith([OLD_ICON_PATH])
    })

    it('leaves the icon alone when the save touches only the name and model', async () => {
      boatMaybeSingle.mockResolvedValue({
        data: { id: 'boat-1', icon_path: OLD_ICON_PATH },
        error: null,
      })

      await saveBoatIdentity(form(AS_IS))

      expect(update).toHaveBeenCalledWith(AS_IS)
      expect(upload).not.toHaveBeenCalled()
      expect(remove).not.toHaveBeenCalled()
    })

    it('writes no row when Storage refuses the bytes', async () => {
      upload.mockResolvedValue({ data: null, error: { message: 'new row violates row-level security policy' } })

      const result = await saveBoatIdentity(form({ ...AS_IS, icon: icon(PNG_BYTES) }))

      expect(result.ok).toBe(false)
      expectNoWrite()
    })

    it('takes back the new bytes and keeps the old icon when the row is refused', async () => {
      boatMaybeSingle.mockResolvedValue({
        data: { id: 'boat-1', icon_path: OLD_ICON_PATH },
        error: null,
      })
      updateEq.mockResolvedValue({ error: { message: 'boom' } })

      const result = await saveBoatIdentity(form({ ...AS_IS, icon: icon(PNG_BYTES) }))

      expect(result.ok).toBe(false)
      expect(remove).toHaveBeenCalledWith(['boat-identity/icon/pete.png'])
      expect(remove).not.toHaveBeenCalledWith([OLD_ICON_PATH])
    })

    it('still reports a save that landed when the old object could not be deleted', async () => {
      // The row is the truth and it is right. An orphaned object costs a few kilobytes; a
      // refusal here would tell the admin a save failed that did not.
      boatMaybeSingle.mockResolvedValue({
        data: { id: 'boat-1', icon_path: OLD_ICON_PATH },
        error: null,
      })
      remove.mockResolvedValue({ data: null, error: { message: 'boom' } })

      const result = await saveBoatIdentity(form({ ...AS_IS, removeIcon: 'true' }))

      expect(result).toEqual({ ok: true })
      expect(consoleError).toHaveBeenCalled()
    })
  })
})
