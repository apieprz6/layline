import {
  readCrossoverChartScreen,
  readCrossoverChartVersion,
  readCrossoverChartVersions,
} from '../readCrossoverChartVersions'

/**
 * Reading the **Crossover Chart**'s Versions.
 *
 * The queries are `readFileBackedVersions`', which `readPolarVersions.test.ts` already exercises in
 * full — the list order, the missing artifact row, the absent environment, the one-artifact-read
 * promise. Repeating all of that here would test the shared reader twice and this module not at all.
 *
 * So what is tested here is what is this artifact's own: that it reads the `crossover_chart` row and
 * not the Polar's, that the payload it accepts carries both halves, and that a stored payload the
 * chart schema refuses is reported rather than rendered.
 */

const artifactEq = jest.fn()
const artifactMaybeSingle = jest.fn()
const versionsOrder = jest.fn()
const versionMaybeSingle = jest.fn()

const from = jest.fn((table: string) => {
  if (table === 'boat_setup_artifacts') {
    return {
      select: () => ({
        eq: (column: string, value: string) => {
          artifactEq(column, value)
          return { maybeSingle: artifactMaybeSingle }
        },
      }),
    }
  }
  if (table === 'boat_setup_versions') {
    return {
      select: () => ({
        eq: () => ({
          order: () => ({ returns: versionsOrder }),
          eq: () => ({ maybeSingle: versionMaybeSingle }),
        }),
      }),
    }
  }
  throw new Error(`the Crossover Chart read asked for an unexpected table: ${table}`)
})

const createClient = jest.fn(async () => ({ from }))

jest.mock('@/lib/supabase/server', () => ({ createClient: () => createClient() }))

const ID1 = 'bb000000-0000-4000-8000-000000000001'
const ID2 = 'bb000000-0000-4000-8000-000000000002'

const V1 = {
  id: ID1,
  version_number: 1,
  effective_from: '2026-04-21',
  recorded_at: '2026-09-15T04:00:00Z',
  note: null,
  filename: 'HandsomePete_2026.sailselect',
  content_sha256: 'a'.repeat(64),
}

const V2 = { ...V1, id: ID2, version_number: 2, effective_from: '2026-06-14' }

/** A chart the payload schema accepts, small enough to read in a test. */
const CHART = {
  twa_axis: [40, 80],
  tws_axis: [8, 12],
  cells: [
    [1, 1],
    [6, 2],
  ],
  sail_definitions: [
    { number: 1, label: 'Main + Jib 1' },
    { number: 2, label: 'Main + Jib 2' },
    { number: 6, label: 'Main + A3' },
  ],
  source: {
    format: 'qtvlm-sailselect',
    header_token: 'TWA/TWS',
    definitions: {
      format: 'qtvlm-saildesc',
      filename: 'HandsomePete_2026.saildef',
      content_sha256: 'b'.repeat(64),
    },
  },
}

describe('readCrossoverChartVersions', () => {
  let consoleError: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    artifactMaybeSingle.mockResolvedValue({
      data: { id: 'artifact-crossover', current_version_id: ID2 },
      error: null,
    })
    versionsOrder.mockResolvedValue({ data: [V2, V1], error: null })
    versionMaybeSingle.mockResolvedValue({ data: { ...V2, payload: CHART }, error: null })
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it('reads the Crossover Chart artifact and not another kind', async () => {
    await readCrossoverChartVersions()

    expect(artifactEq).toHaveBeenCalledWith('kind', 'crossover_chart')
  })

  it('lists every Version newest first, marking the one in force', async () => {
    await expect(readCrossoverChartVersions()).resolves.toEqual({
      current_version_id: ID2,
      versions: [
        { ...V2, is_current: true },
        { ...V1, is_current: false },
      ],
    })
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('reads one Version with its grid and its definitions together', async () => {
    versionMaybeSingle.mockResolvedValue({ data: { ...V1, payload: CHART }, error: null })

    // One Version, one payload, both halves. A Race that freezes this pointer freezes the pairing.
    await expect(readCrossoverChartVersion(ID1)).resolves.toEqual({
      ...V1,
      is_current: false,
      payload: CHART,
    })
  })

  it('gives the screen its list and the chart the pointer is at', async () => {
    const screen = await readCrossoverChartScreen()

    expect(screen?.list.versions.map((version) => version.version_number)).toEqual([2, 1])
    expect(screen?.current).toMatchObject({ id: ID2, is_current: true, payload: CHART })
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('refuses to render a stored payload whose cells resolve to nothing', async () => {
    // The row's own CHECK only requires the four keys to be present. A cell calling for a sail no
    // definition defines has no name to draw in that box, so it is reported as unreadable rather
    // than displayed as a chart with blanks in it.
    versionMaybeSingle.mockResolvedValue({
      data: { ...V1, payload: { ...CHART, cells: [[1, 1], [6, 9]] } },
      error: null,
    })

    await expect(readCrossoverChartVersion(ID1)).resolves.toBeNull()
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('v1'),
      expect.stringContaining('9')
    )
  })

  it('still lists the Versions when the one in force holds no readable chart', async () => {
    versionMaybeSingle.mockResolvedValue({
      data: { ...V2, payload: { ...CHART, sail_definitions: [] } },
      error: null,
    })

    const screen = await readCrossoverChartScreen()

    expect(screen?.current).toBeNull()
    expect(screen?.list.versions).toHaveLength(2)
    expect(consoleError).toHaveBeenCalled()
  })

  it('says which artifact the log line is about', async () => {
    versionsOrder.mockResolvedValue({ data: null, error: { message: 'connection reset' } })

    await expect(readCrossoverChartVersions()).resolves.toBeNull()
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('Crossover Chart'),
      expect.anything()
    )
  })
})
