import { saveBoatIdentity } from '../actions'
import { CREW } from '@/__tests__/fixtures/accounts'

const boatMaybeSingle = jest.fn()
const updateEq = jest.fn()
const update = jest.fn(() => ({ eq: updateEq }))

const from = jest.fn((table: string) => {
  if (table !== 'boats') throw new Error(`saveBoatIdentity touched ${table}`)
  return { select: () => ({ maybeSingle: boatMaybeSingle }), update }
})

const createClient = jest.fn(async () => ({ from }))

jest.mock('@/lib/supabase/server', () => ({ createClient: () => createClient() }))
jest.mock('@/lib/account/resolveAccount', () => ({ resolveAccount: jest.fn() }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

const { resolveAccount } = jest.requireMock('@/lib/account/resolveAccount')
const { revalidatePath } = jest.requireMock('next/cache')

const ADMIN = { ...CREW, role: 'admin' as const }

function form(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.append(key, value)
  return data
}

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
    boatMaybeSingle.mockResolvedValue({ data: { id: 'boat-1' }, error: null })
    updateEq.mockResolvedValue({ error: null })
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
    expect(revalidatePath).toHaveBeenCalledWith('/boat-management')
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
})
