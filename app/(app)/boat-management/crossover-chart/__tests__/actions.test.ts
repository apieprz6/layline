import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { commitCrossoverChartVersion, previewCrossoverChartUpload } from '../actions'
import { CREW } from '@/__tests__/fixtures/accounts'

const upload = jest.fn()
const storageFrom = jest.fn(() => ({ upload }))
const rpc = jest.fn()
const highestMaybeSingle = jest.fn()

const from = jest.fn((table: string) => {
  if (table !== 'boat_setup_versions') {
    throw new Error(`the Crossover Chart upload touched ${table}`)
  }
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

function fixture(name: string): string {
  return readFileSync(join(process.cwd(), 'docs/research/fixtures', name), 'utf8')
}

/** qtVlm's own documented pair: a 9 × 7 chart and the eight sails its cells resolve against. */
const GRID = fixture('qtvlm-doc-example.sailselect')
const DEFINITIONS = fixture('qtvlm-doc-example.saildesc')

function sha(contents: string): string {
  return createHash('sha256').update(Buffer.from(contents, 'utf8')).digest('hex')
}

const GRID_SHA = sha(GRID)
const DEFINITIONS_SHA = sha(DEFINITIONS)

/**
 * A file as a browser hands one over.
 *
 * `arrayBuffer()` is attached to the instance because jsdom's `File` predates it, and the action
 * reads the bytes rather than the text — it is the bytes that get hashed and stored. It has to be a
 * jsdom `File` all the same, since that is the constructor the action's `instanceof` sees.
 */
function droppedFile(contents: string, name: string, type = 'text/plain'): File {
  const bytes = Buffer.from(contents, 'utf8')
  const file = new File([contents], name, { type })

  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  })

  return file
}

interface FormOptions {
  grid?: string
  definitions?: string
  gridName?: string
  definitionsName?: string
  fields?: Record<string, string>
  /** Which halves to put on the form at all, for the "one file missing" refusals. */
  omit?: ('grid' | 'definitions')[]
}

function chartForm(options: FormOptions = {}): FormData {
  const grid = options.grid ?? GRID
  const definitions = options.definitions ?? DEFINITIONS
  const omit = options.omit ?? []

  const body = new FormData()

  if (!omit.includes('grid')) {
    body.set('grid', droppedFile(grid, options.gridName ?? 'HandsomePete_2026.sailselect'))
  }

  if (!omit.includes('definitions')) {
    body.set(
      'definitions',
      droppedFile(definitions, options.definitionsName ?? 'HandsomePete_2026.saildesc')
    )
  }

  for (const [key, value] of Object.entries(options.fields ?? {})) body.set(key, value)

  return body
}

/** The confirm as the panel posts it: both files again, plus the date and both checksums. */
function confirmForm(options: FormOptions = {}): FormData {
  return chartForm({
    ...options,
    fields: {
      effective_from: '2026-04-21',
      grid_content_sha256: sha(options.grid ?? GRID),
      definitions_content_sha256: sha(options.definitions ?? DEFINITIONS),
      ...options.fields,
    },
  })
}

describe('previewCrossoverChartUpload', () => {
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

  it('reads both dropped files into one chart', async () => {
    const result = await previewCrossoverChartUpload(chartForm())

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.preview.payload.twa_axis).toEqual([40, 80, 100, 110, 120, 130, 140, 150, 180])
    expect(result.preview.payload.tws_axis).toEqual([8, 12, 16, 20, 25, 30, 32])
    expect(result.preview.payload.cells[0]).toEqual([1, 1, 2, 3, 3, 4, 5])
    expect(result.preview.payload.sail_definitions).toHaveLength(8)
    expect(result.preview.payload.sail_definitions[6]).toEqual({ number: 7, label: 'GV + Assym' })
  })

  it('records where each half came from, the grid’s header token included', async () => {
    const result = await previewCrossoverChartUpload(chartForm())

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.preview.payload.source).toEqual({
      format: 'qtvlm-sailselect',
      header_token: 'TWA/TWS',
      definitions: {
        format: 'qtvlm-saildesc',
        filename: 'HandsomePete_2026.saildesc',
        content_sha256: DEFINITIONS_SHA,
      },
    })
  })

  it('hashes both halves as dropped, and names the number the upload would take', async () => {
    const result = await previewCrossoverChartUpload(chartForm())

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.preview.grid).toEqual({
      filename: 'HandsomePete_2026.sailselect',
      byte_length: Buffer.byteLength(GRID, 'utf8'),
      content_sha256: GRID_SHA,
    })
    expect(result.preview.definitions).toEqual({
      filename: 'HandsomePete_2026.saildesc',
      byte_length: Buffer.byteLength(DEFINITIONS, 'utf8'),
      content_sha256: DEFINITIONS_SHA,
    })
    expect(result.preview.next_version_number).toBe(3)
  })

  it('says how much of the chart each definition accounts for', async () => {
    const result = await previewCrossoverChartUpload(chartForm())

    expect(result.ok).toBe(true)
    if (!result.ok) return

    // In the definitions' own order rather than by how much of the chart they hold: the legend the
    // admin checks reads down the file they uploaded.
    expect(result.preview.usage.map((entry) => entry.definition.number)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ])
    expect(result.preview.usage[5]).toEqual({
      definition: { number: 6, label: 'GV + Leger' },
      cells: 5,
    })
  })

  it('reports a definition no cell calls for rather than dropping it', async () => {
    // The converse of a dangling id, and legal: an inventory entry the chart never recommends is a
    // real state. qtVlm's own example calls for all eight sails, so the ninth is added here.
    const result = await previewCrossoverChartUpload(
      chartForm({ definitions: `${DEFINITIONS}9;GV + Tourmentin\n` })
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.preview.usage).toHaveLength(9)
    expect(result.preview.usage[8]).toEqual({
      definition: { number: 9, label: 'GV + Tourmentin' },
      cells: 0,
    })
  })

  it('writes nothing at all — no bytes, no row, no revalidation', async () => {
    await previewCrossoverChartUpload(chartForm())

    expect(upload).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('reports each half’s own oddities separately', async () => {
    const result = await previewCrossoverChartUpload(
      chartForm({ grid: `﻿${GRID}`, definitions: `# the boat's sails\n${DEFINITIONS}` })
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.preview.grid_warnings.map((warning) => warning.code)).toEqual(['bom-stripped'])
    expect(result.preview.definitions_warnings.map((warning) => warning.code)).toEqual([
      'comment-line-skipped',
    ])
  })

  it('names the grid file when the grid is the half that will not read', async () => {
    const broken = GRID.split('\n')
      .map((line, index) => (index === 3 ? '100;7;7' : line))
      .join('\n')

    const result = await previewCrossoverChartUpload(chartForm({ grid: broken }))

    expect(result).toMatchObject({
      ok: false,
      message: expect.stringContaining('HandsomePete_2026.sailselect'),
    })
    expect(result).toMatchObject({ message: expect.stringMatching(/line 4/) })
  })

  it('names the definitions file when the definitions are the half that will not read', async () => {
    const result = await previewCrossoverChartUpload(
      chartForm({ definitions: '1;GV + Genois\n2\n' })
    )

    expect(result).toMatchObject({
      ok: false,
      message: expect.stringContaining('HandsomePete_2026.saildesc'),
    })
  })

  it('refuses a chart whose cells the definitions do not cover', async () => {
    // Each half is a perfectly good file. Neither parser has seen the other's, so this is the one
    // place the pairing is checked — and a dangling id has no sail to name in that box.
    const result = await previewCrossoverChartUpload(
      chartForm({ definitions: DEFINITIONS.split('\n').slice(0, 4).join('\n') })
    )

    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/sail 5/) })
  })

  it('refuses a definitions file still using a superseded sail name', async () => {
    const result = await previewCrossoverChartUpload(
      chartForm({ definitions: DEFINITIONS.replace('GV + Assym', 'Main + Reaching Spin') })
    )

    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/A3/) })
    // A refusal and never a rewrite: the bytes in Storage are the sailor's, and the message says
    // what the corrected label would be rather than quietly substituting it.
    expect(result).toMatchObject({ message: expect.stringMatching(/Main \+ A3/) })
  })

  it('refuses a viewer, who has nothing to preview an upload for', async () => {
    resolveAccount.mockResolvedValue({ ...CREW, role: 'viewer' })

    await expect(previewCrossoverChartUpload(chartForm())).resolves.toEqual({
      ok: false,
      message: expect.stringMatching(/admin/i),
    })
  })

  it('refuses a Guest', async () => {
    resolveAccount.mockResolvedValue(null)

    await expect(previewCrossoverChartUpload(chartForm())).resolves.toMatchObject({ ok: false })
  })

  it('asks for the chart when only the definitions were chosen', async () => {
    const result = await previewCrossoverChartUpload(chartForm({ omit: ['grid'] }))

    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/\.sailselect/) })
  })

  it('asks for the definitions when only the chart was chosen', async () => {
    // Half a Crossover Chart is not a Version of anything: without the definitions the cells are
    // numbers with no sails behind them (ADR 0012).
    const result = await previewCrossoverChartUpload(chartForm({ omit: ['definitions'] }))

    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/definitions/i) })
  })

  it('does not read either file’s MIME type — parsing is the gate', async () => {
    const body = new FormData()
    // What a browser on another machine calls the same two files.
    body.set(
      'grid',
      droppedFile(GRID, 'HandsomePete_2026.sailselect', 'application/octet-stream')
    )
    body.set('definitions', droppedFile(DEFINITIONS, 'HandsomePete_2026.saildesc', ''))

    await expect(previewCrossoverChartUpload(body)).resolves.toMatchObject({ ok: true })
  })

  it('refuses a file no chart could be, before parsing a megabyte of it', async () => {
    const result = await previewCrossoverChartUpload(chartForm({ grid: 'x'.repeat(1_048_577) }))

    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/KB/) })
  })
})

describe('commitCrossoverChartVersion', () => {
  let consoleError: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    resolveAccount.mockResolvedValue(ADMIN)
    highestMaybeSingle.mockResolvedValue({ data: { version_number: 2 }, error: null })
    upload.mockResolvedValue({ data: { path: 'boat-setup/crossover_chart/x/y' }, error: null })
    rpc.mockResolvedValue({ data: 3, error: null })
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it('moves both files to one prefix, then writes the one Version', async () => {
    const result = await commitCrossoverChartVersion(confirmForm())

    expect(result).toEqual({ ok: true, version_id: expect.any(String), version_number: 3 })

    // ADR 0013's order, and the whole reason the version id is minted in the action: the paths
    // contain it, and the bytes are at them before the transaction commits.
    expect(upload).toHaveBeenCalledTimes(2)

    const [gridPath] = upload.mock.calls[0]
    const [definitionsPath] = upload.mock.calls[1]

    expect(gridPath).toMatch(
      /^boat-setup\/crossover_chart\/[0-9a-f-]{36}\/HandsomePete_2026\.sailselect$/
    )
    // The same prefix, so one Version's two halves live together and neither needs its own row.
    expect(definitionsPath).toBe(
      `${(gridPath as string).replace(/[^/]+$/, '')}HandsomePete_2026.saildesc`
    )
    expect(upload.mock.invocationCallOrder[1]).toBeLessThan(rpc.mock.invocationCallOrder[0])
  })

  it('stores both sets of bytes verbatim', async () => {
    await commitCrossoverChartVersion(confirmForm())

    const gridBytes = upload.mock.calls[0][1] as Uint8Array
    const definitionsBytes = upload.mock.calls[1][1] as Uint8Array

    expect(gridBytes).toBeInstanceOf(Uint8Array)
    expect(createHash('sha256').update(gridBytes).digest('hex')).toBe(GRID_SHA)
    expect(createHash('sha256').update(definitionsBytes).digest('hex')).toBe(DEFINITIONS_SHA)
  })

  it('mints the Version through the one transaction that also moves the pointer', async () => {
    await commitCrossoverChartVersion(confirmForm({ fields: { note: 'A3 replaced the old kite.' } }))

    expect(rpc).toHaveBeenCalledWith('mint_boat_setup_version', {
      p_version_id: expect.any(String),
      p_kind: 'crossover_chart',
      p_effective_from: '2026-04-21',
      p_payload: expect.objectContaining({
        cells: expect.any(Array),
        sail_definitions: expect.any(Array),
      }),
      p_note: 'A3 replaced the old kite.',
      // The grid's, because the row has one filename column and the grid is the artifact's namesake.
      p_filename: 'HandsomePete_2026.sailselect',
      p_content_sha256: GRID_SHA,
    })
  })

  it('keeps the definitions half’s own name and hash in the payload', async () => {
    // There are no columns for a second file, and there should not be: a second file is not
    // machinery every kind shares (ADR 0022). So its provenance travels with the definitions.
    await commitCrossoverChartVersion(confirmForm())

    const payload = rpc.mock.calls[0][1].p_payload as {
      source: { definitions: { filename: string; content_sha256: string } }
    }

    expect(payload.source.definitions).toEqual({
      format: 'qtvlm-saildesc',
      filename: 'HandsomePete_2026.saildesc',
      content_sha256: DEFINITIONS_SHA,
    })
  })

  it('writes one Version and not two', async () => {
    await commitCrossoverChartVersion(confirmForm())

    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('stores no note at all rather than an empty one', async () => {
    await commitCrossoverChartVersion(confirmForm({ fields: { note: '   ' } }))

    expect(rpc.mock.calls[0][1].p_note).toBeNull()
  })

  it('re-parses both files rather than trusting a chart the client posted', async () => {
    const body = confirmForm()
    // A client that says the boat flies the spinnaker upwind in 32 knots.
    body.set(
      'payload',
      JSON.stringify({ twa_axis: [40], tws_axis: [32], cells: [[8]], sail_definitions: [] })
    )

    await commitCrossoverChartVersion(body)

    const payload = rpc.mock.calls[0][1].p_payload as { cells: number[][] }
    expect(payload.cells[0]).toEqual([1, 1, 2, 3, 3, 4, 5])
  })

  it('refuses a confirm whose grid is not the grid that was previewed', async () => {
    const body = confirmForm({ fields: { grid_content_sha256: 'f'.repeat(64) } })

    const result = await commitCrossoverChartVersion(body)

    expect(result).toMatchObject({
      ok: false,
      message: expect.stringContaining('HandsomePete_2026.sailselect'),
    })
    expect(result).toMatchObject({ message: expect.stringMatching(/changed/i) })
    expect(upload).not.toHaveBeenCalled()
  })

  it('refuses a confirm whose definitions are not the definitions that were previewed', async () => {
    // The half most worth checking: swapping the definitions changes what every cell in the chart
    // means without changing a byte of the grid.
    const body = confirmForm({ fields: { definitions_content_sha256: 'f'.repeat(64) } })

    const result = await commitCrossoverChartVersion(body)

    expect(result).toMatchObject({
      ok: false,
      message: expect.stringContaining('HandsomePete_2026.saildesc'),
    })
    expect(upload).not.toHaveBeenCalled()
  })

  it('refuses a confirm that carries no checksums at all', async () => {
    // A confirm with no hashes on it has not been through a preview. Saying "the file changed"
    // would be the wrong sentence, so it gets its own.
    const body = chartForm({ fields: { effective_from: '2026-04-21' } })

    const result = await commitCrossoverChartVersion(body)

    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/checksum/i) })
    expect(result).not.toMatchObject({ message: expect.stringMatching(/changed/i) })
    expect(upload).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('refuses a viewer, and writes nothing', async () => {
    // RLS would refuse this too, but a Server Action is a public endpoint and the panel not being
    // rendered is not the check (ADR 0019).
    resolveAccount.mockResolvedValue({ ...CREW, role: 'viewer' })

    const result = await commitCrossoverChartVersion(confirmForm())

    expect(result.ok).toBe(false)
    expect(upload).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('refuses a Guest, and writes nothing', async () => {
    resolveAccount.mockResolvedValue(null)

    await expect(commitCrossoverChartVersion(confirmForm())).resolves.toMatchObject({ ok: false })
    expect(upload).not.toHaveBeenCalled()
  })

  it('insists on the date the Version took effect', async () => {
    const body = chartForm({
      fields: { grid_content_sha256: GRID_SHA, definitions_content_sha256: DEFINITIONS_SHA },
    })

    const result = await commitCrossoverChartVersion(body)

    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/date/i) })
    expect(upload).not.toHaveBeenCalled()
  })

  it('refuses a date that has the shape but not the day', async () => {
    // Postgres would refuse `2026-02-30` too, but only after the bytes are at their permanent
    // paths — which is two files nothing points at, for a typo that could be caught here.
    const result = await commitCrossoverChartVersion(
      confirmForm({ fields: { effective_from: '2026-02-30' } })
    )

    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/date/i) })
    expect(upload).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('refuses a filename there is no Storage path to be made from', async () => {
    // A browser will not send `..`, but a Server Action is a public endpoint and the filenames are
    // the caller's to choose. `boatSetupObjectPath` throws on it, and a throw here would reach the
    // admin as an unhandled Server Action error rather than as a sentence.
    const result = await commitCrossoverChartVersion(confirmForm({ definitionsName: '..' }))

    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/name/i) })
    expect(upload).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
    expect(consoleError).toHaveBeenCalled()
  })

  it('refuses two files that would be stored under the same name', async () => {
    // Both halves share one prefix, so two identical names would have the second overwrite the
    // first — and the bytes handed back later have to be the bytes we were given.
    const result = await commitCrossoverChartVersion(
      confirmForm({ gridName: 'chart.txt', definitionsName: 'chart.txt' })
    )

    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('chart.txt') })
    expect(upload).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('leaves the bytes where they are when the Version does not write', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'current_version_id moves forward only' },
    })

    const result = await commitCrossoverChartVersion(confirmForm())

    expect(result.ok).toBe(false)
    // ADR 0013 takes orphaned bytes over orphaned rows, and deleting here could delete the files
    // of a Version that did commit and whose response was lost.
    expect(upload).toHaveBeenCalledTimes(2)
    expect(consoleError).toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('does not write a Version when the definitions bytes are refused', async () => {
    upload
      .mockResolvedValueOnce({ data: { path: 'grid' }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'The resource already exists' } })

    const result = await commitCrossoverChartVersion(confirmForm())

    expect(result.ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('does not upload the definitions when the grid bytes are refused', async () => {
    upload.mockResolvedValue({ data: null, error: { message: 'The resource already exists' } })

    const result = await commitCrossoverChartVersion(confirmForm())

    expect(result.ok).toBe(false)
    expect(upload).toHaveBeenCalledTimes(1)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('refreshes both screens that state which Version is in force', async () => {
    await commitCrossoverChartVersion(confirmForm())

    expect(revalidatePath).toHaveBeenCalledWith('/boat-management/crossover-chart')
    expect(revalidatePath).toHaveBeenCalledWith('/boat-management')
  })

  it('refuses a pair that does not parse, and reaches Storage never', async () => {
    const result = await commitCrossoverChartVersion(
      confirmForm({ grid: 'this is not a sail chart\n' })
    )

    expect(result.ok).toBe(false)
    expect(upload).not.toHaveBeenCalled()
  })

  it('refuses when there is no Supabase environment to write to', async () => {
    createClient.mockRejectedValueOnce(new Error('Missing Supabase environment variables.'))

    const result = await commitCrossoverChartVersion(confirmForm())

    expect(result.ok).toBe(false)
    expect(upload).not.toHaveBeenCalled()
  })
})
