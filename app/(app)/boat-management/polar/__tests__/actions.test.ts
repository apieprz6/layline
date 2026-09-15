import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { commitPolarVersion, previewPolarUpload } from '../actions'
import { CREW } from '@/__tests__/fixtures/accounts'

const upload = jest.fn()
const storageFrom = jest.fn(() => ({ upload }))
const rpc = jest.fn()
const highestMaybeSingle = jest.fn()

const from = jest.fn((table: string) => {
  if (table !== 'boat_setup_versions') throw new Error(`the Polar upload touched ${table}`)
  return {
    select: () => ({
      eq: () => ({
        order: () => ({ limit: () => ({ maybeSingle: highestMaybeSingle }) }),
      }),
    }),
  }
})

const createClient = jest.fn(async () => ({ from, rpc, storage: { from: storageFrom } }))

jest.mock('@/lib/supabase/server', () => ({ createClient: () => createClient() }))
jest.mock('@/lib/account/resolveAccount', () => ({ resolveAccount: jest.fn() }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

const { resolveAccount } = jest.requireMock('@/lib/account/resolveAccount')
const { revalidatePath } = jest.requireMock('next/cache')

const ADMIN = { ...CREW, role: 'admin' as const }

/** A real third-party ORC polar: 8 angles × 9 wind speeds, semicolon-delimited. */
const ORC = readFileSync(join(process.cwd(), 'docs/research/fixtures/orc-first-10r.pol'), 'utf8')

const ORC_SHA = createHash('sha256').update(Buffer.from(ORC, 'utf8')).digest('hex')

/**
 * A `.pol` as a browser hands one over.
 *
 * `arrayBuffer()` is attached to the instance because jsdom's `File` predates it, and the action
 * reads the bytes rather than the text — it is the bytes that get hashed and stored. It has to be
 * a jsdom `File` all the same, since that is the constructor the action's `instanceof` sees.
 */
function polarFile(contents: string, type = 'text/plain', name = 'FIRST_10R.pol'): File {
  const bytes = Buffer.from(contents, 'utf8')
  const file = new File([contents], name, { type })

  Object.defineProperty(file, 'arrayBuffer', {
    value: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  })

  return file
}

function polarForm(contents: string, fields: Record<string, string> = {}): FormData {
  const body = new FormData()
  body.set('file', polarFile(contents))
  for (const [key, value] of Object.entries(fields)) body.set(key, value)
  return body
}

/** The confirm as the panel posts it: the file again, plus the three fields. */
function confirmForm(contents = ORC, fields: Record<string, string> = {}): FormData {
  return polarForm(contents, {
    effective_from: '2026-04-21',
    content_sha256: createHash('sha256').update(Buffer.from(contents, 'utf8')).digest('hex'),
    ...fields,
  })
}

describe('previewPolarUpload', () => {
  let consoleError: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    resolveAccount.mockResolvedValue(ADMIN)
    highestMaybeSingle.mockResolvedValue({ data: { version_number: 2 }, error: null })
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it('parses the dropped file and hands back the grid', async () => {
    const result = await previewPolarUpload(polarForm(ORC))

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.preview.payload.twa_axis).toEqual([52, 60, 75, 90, 110, 120, 135, 150])
    expect(result.preview.payload.tws_axis).toEqual([4, 6, 8, 10, 12, 14, 16, 20, 24])
    expect(result.preview.payload.boat_speed[0]).toEqual([
      3.96, 5.39, 6.29, 6.78, 7.01, 7.11, 7.16, 7.21, 7.19,
    ])
  })

  it('records the format and the header token the file actually used', async () => {
    const result = await previewPolarUpload(polarForm(ORC))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.preview.payload.source).toEqual({
      format: 'orc-pol',
      header_token: 'twa/tws',
    })
  })

  it('hashes the bytes as dropped, and names the number the upload would take', async () => {
    const result = await previewPolarUpload(polarForm(ORC))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.preview.content_sha256).toBe(ORC_SHA)
    expect(result.preview.byte_length).toBe(Buffer.byteLength(ORC, 'utf8'))
    expect(result.preview.next_version_number).toBe(3)
  })

  it('writes nothing at all — no bytes, no row, no revalidation', async () => {
    await previewPolarUpload(polarForm(ORC))

    expect(upload).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('reports a byte-order mark rather than swallowing it', async () => {
    const result = await previewPolarUpload(polarForm(`﻿${ORC}`))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.preview.warnings.map((warning) => warning.code)).toContain('bom-stripped')
  })

  it('refuses a viewer, who has nothing to preview an upload for', async () => {
    resolveAccount.mockResolvedValue({ ...CREW, role: 'viewer' })

    await expect(previewPolarUpload(polarForm(ORC))).resolves.toEqual({
      ok: false,
      message: expect.stringMatching(/admin/i),
    })
  })

  it('refuses a Guest', async () => {
    resolveAccount.mockResolvedValue(null)

    await expect(previewPolarUpload(polarForm(ORC))).resolves.toMatchObject({ ok: false })
  })

  it('refuses a form with no file on it', async () => {
    await expect(previewPolarUpload(new FormData())).resolves.toMatchObject({ ok: false })
  })

  it('says which line it gave up on', async () => {
    const broken = ORC.split('\n')
      .map((line, index) => (index === 3 ? '75;4.46;5.84' : line))
      .join('\n')

    const result = await previewPolarUpload(polarForm(broken))

    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/line 4/) })
  })

  it('does not read the file’s MIME type — parsing is the gate', async () => {
    const body = new FormData()
    // What a browser on another machine calls the same `.pol`.
    body.set('file', polarFile(ORC, 'application/octet-stream'))

    await expect(previewPolarUpload(body)).resolves.toMatchObject({ ok: true })
  })

  it('refuses a file no polar could be, before parsing a megabyte of it', async () => {
    const result = await previewPolarUpload(polarForm('x'.repeat(1_048_577)))

    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/KB/) })
  })
})

describe('commitPolarVersion', () => {
  let consoleError: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    resolveAccount.mockResolvedValue(ADMIN)
    highestMaybeSingle.mockResolvedValue({ data: { version_number: 2 }, error: null })
    upload.mockResolvedValue({ data: { path: 'boat-setup/polar/x/FIRST_10R.pol' }, error: null })
    rpc.mockResolvedValue({ data: 3, error: null })
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it('moves the bytes to their permanent path, then writes the Version', async () => {
    const result = await commitPolarVersion(confirmForm())

    expect(result).toEqual({ ok: true, version_id: expect.any(String), version_number: 3 })

    // ADR 0013's order, and the whole reason the version id is minted in the action: the path
    // contains it, and the bytes are at it before the transaction commits.
    const [path, bytes] = upload.mock.calls[0]
    expect(path).toMatch(/^boat-setup\/polar\/[0-9a-f-]{36}\/FIRST_10R\.pol$/)
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(upload.mock.invocationCallOrder[0]).toBeLessThan(rpc.mock.invocationCallOrder[0])
  })

  it('stores the bytes verbatim', async () => {
    await commitPolarVersion(confirmForm())

    const bytes = upload.mock.calls[0][1] as Uint8Array
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(ORC_SHA)
  })

  it('mints the Version through the one transaction that also moves the pointer', async () => {
    await commitPolarVersion(confirmForm(ORC, { note: 'Certificate reissued.' }))

    expect(rpc).toHaveBeenCalledWith('mint_boat_setup_version', {
      p_version_id: expect.any(String),
      p_kind: 'polar',
      p_effective_from: '2026-04-21',
      p_payload: expect.objectContaining({ twa_axis: expect.any(Array) }),
      p_note: 'Certificate reissued.',
      p_filename: 'FIRST_10R.pol',
      p_content_sha256: ORC_SHA,
    })
  })

  it('keeps every row the file gave, filler angles included', async () => {
    await commitPolarVersion(confirmForm())

    const payload = rpc.mock.calls[0][1].p_payload as { twa_axis: number[] }
    // The suppression is a display rule and never a storage rule.
    expect(payload.twa_axis).toEqual([52, 60, 75, 90, 110, 120, 135, 150])
  })

  it('stores no note at all rather than an empty one', async () => {
    await commitPolarVersion(confirmForm(ORC, { note: '   ' }))

    expect(rpc.mock.calls[0][1].p_note).toBeNull()
  })

  it('re-parses the file rather than trusting a grid the client posted', async () => {
    const body = confirmForm()
    // A client that says the boat does 20 knots at 52° in 4 knots of wind.
    body.set(
      'payload',
      JSON.stringify({ twa_axis: [52], tws_axis: [4], boat_speed: [[20]] })
    )

    await commitPolarVersion(body)

    const payload = rpc.mock.calls[0][1].p_payload as { boat_speed: number[][] }
    expect(payload.boat_speed[0][0]).toBe(3.96)
  })

  it('refuses a confirm whose file is not the file that was previewed', async () => {
    const body = polarForm(ORC, {
      effective_from: '2026-04-21',
      content_sha256: 'f'.repeat(64),
    })

    const result = await commitPolarVersion(body)

    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/changed/i) })
    expect(upload).not.toHaveBeenCalled()
  })

  it('refuses a confirm that carries no checksum at all', async () => {
    // A confirm with no hash on it has not been through a preview. Saying "the file changed"
    // would be the wrong sentence, so it gets its own.
    const body = polarForm(ORC, { effective_from: '2026-04-21' })

    const result = await commitPolarVersion(body)

    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/checksum/i) })
    expect(result).not.toMatchObject({ message: expect.stringMatching(/changed/i) })
    expect(upload).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('refuses a viewer, and writes nothing', async () => {
    // RLS would refuse this too, but a Server Action is a public endpoint and the panel
    // not being rendered is not the check (ADR 0019).
    resolveAccount.mockResolvedValue({ ...CREW, role: 'viewer' })

    const result = await commitPolarVersion(confirmForm())

    expect(result.ok).toBe(false)
    expect(upload).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('refuses a Guest, and writes nothing', async () => {
    resolveAccount.mockResolvedValue(null)

    await expect(commitPolarVersion(confirmForm())).resolves.toMatchObject({ ok: false })
    expect(upload).not.toHaveBeenCalled()
  })

  it('insists on the date the Version took effect', async () => {
    const body = polarForm(ORC, { content_sha256: ORC_SHA })

    const result = await commitPolarVersion(body)

    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/date/i) })
    expect(upload).not.toHaveBeenCalled()
  })

  it('refuses a date that is not a calendar date', async () => {
    const result = await commitPolarVersion(confirmForm(ORC, { effective_from: 'last April' }))

    expect(result.ok).toBe(false)
    expect(upload).not.toHaveBeenCalled()
  })

  it('refuses a date that has the shape but not the day', async () => {
    // Postgres would refuse `2026-02-30` too, but only after the bytes are at their permanent
    // path — which is a file nothing points at, for a typo that could be caught here.
    const result = await commitPolarVersion(confirmForm(ORC, { effective_from: '2026-02-30' }))

    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/date/i) })
    expect(upload).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('refuses a filename there is no Storage path to be made from', async () => {
    // A browser will not send `..`, but a Server Action is a public endpoint and the filename is
    // the caller's to choose. `boatSetupObjectPath` throws on it, and a throw here would reach
    // the admin as an unhandled Server Action error rather than as a sentence.
    const body = new FormData()
    body.set('file', polarFile(ORC, 'text/plain', '..'))
    body.set('effective_from', '2026-04-21')
    body.set('content_sha256', ORC_SHA)

    const result = await commitPolarVersion(body)

    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/name/i) })
    expect(upload).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
    expect(consoleError).toHaveBeenCalled()
  })

  it('leaves the bytes where they are when the Version does not write', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'current_version_id moves forward only' } })

    const result = await commitPolarVersion(confirmForm())

    expect(result.ok).toBe(false)
    // ADR 0013 takes orphaned bytes over orphaned rows, and deleting here could delete the
    // file of a Version that did commit and whose response was lost.
    expect(upload).toHaveBeenCalled()
    expect(consoleError).toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('does not write a Version when the bytes were refused', async () => {
    upload.mockResolvedValue({ data: null, error: { message: 'The resource already exists' } })

    const result = await commitPolarVersion(confirmForm())

    expect(result.ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('refreshes both screens that state which Version is in force', async () => {
    await commitPolarVersion(confirmForm())

    expect(revalidatePath).toHaveBeenCalledWith('/boat-management/polar')
    expect(revalidatePath).toHaveBeenCalledWith('/boat-management')
  })

  it('refuses a file that does not parse, and reaches Storage never', async () => {
    const result = await commitPolarVersion(confirmForm('this is not a polar\n'))

    expect(result.ok).toBe(false)
    expect(upload).not.toHaveBeenCalled()
  })

  it('refuses when there is no Supabase environment to write to', async () => {
    createClient.mockRejectedValueOnce(new Error('Missing Supabase environment variables.'))

    const result = await commitPolarVersion(confirmForm())

    expect(result.ok).toBe(false)
    expect(upload).not.toHaveBeenCalled()
  })
})
