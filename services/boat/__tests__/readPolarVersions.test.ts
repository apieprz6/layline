import { readPolarScreen, readPolarVersion, readPolarVersions } from '../readPolarVersions'

const artifactMaybeSingle = jest.fn()
const versionsOrder = jest.fn()
const versionMaybeSingle = jest.fn()
const versionsSelect = jest.fn()

const from = jest.fn((table: string) => {
  if (table === 'boat_setup_artifacts') {
    return { select: () => ({ eq: () => ({ maybeSingle: artifactMaybeSingle }) }) }
  }
  if (table === 'boat_setup_versions') {
    return {
      select: (columns: string) => {
        versionsSelect(columns)
        return {
          // The list: filtered to the artifact, newest first.
          eq: () => ({
            // `.returns<T>()` is a type-level cast in supabase-js and resolves to the same
            // `{ data, error }`, so the stub hangs the result off it either way.
            order: () => ({ returns: versionsOrder }),
            // The detail: one more `.eq()` for the id.
            eq: () => ({ maybeSingle: versionMaybeSingle }),
          }),
        }
      },
    }
  }
  throw new Error(`the Polar read asked for an unexpected table: ${table}`)
})

const createClient = jest.fn(async () => ({ from }))

jest.mock('@/lib/supabase/server', () => ({ createClient: () => createClient() }))

/** Real uuids, because the read asks whether an id is one before it asks the database. */
const ID1 = 'aa000000-0000-4000-8000-000000000001'
const ID2 = 'aa000000-0000-4000-8000-000000000002'
const ABSENT = 'aa000000-0000-4000-8000-00000000ffff'

const V1 = {
  id: ID1,
  version_number: 1,
  effective_from: '2026-04-21',
  recorded_at: '2026-09-15T04:00:00Z',
  note: null,
  filename: 'FIRST_10R.pol',
  content_sha256: 'a'.repeat(64),
}

const V2 = {
  ...V1,
  id: ID2,
  version_number: 2,
  effective_from: '2026-06-14',
  note: 'Re-measured after the new main.',
  filename: 'FIRST_10R_2026.pol',
}

/** A grid the payload schema accepts, small enough to read in a test. */
const GRID = {
  twa_axis: [52, 60],
  tws_axis: [4, 6],
  boat_speed: [
    [3.96, 5.39],
    [4.25, 5.66],
  ],
  source: { format: 'orc-pol', header_token: 'twa/tws' },
}

describe('readPolarVersions', () => {
  let consoleError: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    artifactMaybeSingle.mockResolvedValue({
      data: { id: 'artifact-polar', current_version_id: ID2 },
      error: null,
    })
    versionsOrder.mockResolvedValue({ data: [V2, V1], error: null })
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it('lists every Version newest first, marking the one in force', async () => {
    await expect(readPolarVersions()).resolves.toEqual({
      current_version_id: ID2,
      versions: [
        { ...V2, is_current: true },
        { ...V1, is_current: false },
      ],
    })
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('keeps a superseded Version in the list', async () => {
    // A polar that was in force for a season is what that season's races were sailed against.
    const list = await readPolarVersions()

    expect(list?.versions.map((version) => version.version_number)).toEqual([2, 1])
  })

  it('does not read nine grids to render one list', async () => {
    await readPolarVersions()

    expect(versionsSelect).toHaveBeenCalledWith(expect.not.stringContaining('payload'))
  })

  it('reports an empty archive as empty, not as a failure', async () => {
    artifactMaybeSingle.mockResolvedValue({
      data: { id: 'artifact-polar', current_version_id: null },
      error: null,
    })
    versionsOrder.mockResolvedValue({ data: [], error: null })

    await expect(readPolarVersions()).resolves.toEqual({
      current_version_id: null,
      versions: [],
    })
  })

  it('reports a failed read as a failed read', async () => {
    versionsOrder.mockResolvedValue({ data: null, error: { message: 'connection reset' } })

    await expect(readPolarVersions()).resolves.toBeNull()
    expect(consoleError).toHaveBeenCalled()
  })

  it('reports a missing artifact row, which the migration promises exists', async () => {
    artifactMaybeSingle.mockResolvedValue({ data: null, error: null })

    await expect(readPolarVersions()).resolves.toBeNull()
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('artifact'))
  })

  it('degrades to a failed read with no Supabase environment', async () => {
    createClient.mockRejectedValueOnce(new Error('NEXT_PUBLIC_SUPABASE_URL is missing'))

    await expect(readPolarVersions()).resolves.toBeNull()
  })
})

describe('readPolarVersion', () => {
  let consoleError: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    artifactMaybeSingle.mockResolvedValue({
      data: { id: 'artifact-polar', current_version_id: ID2 },
      error: null,
    })
    versionMaybeSingle.mockResolvedValue({ data: { ...V1, payload: GRID }, error: null })
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it('reads one Version with its grid', async () => {
    await expect(readPolarVersion(ID1)).resolves.toEqual({
      ...V1,
      is_current: false,
      payload: GRID,
    })
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('says which Version is the one in force', async () => {
    versionMaybeSingle.mockResolvedValue({ data: { ...V2, payload: GRID }, error: null })

    await expect(readPolarVersion(ID2)).resolves.toMatchObject({ is_current: true })
  })

  it('has nothing to show for an id that is not a Polar Version', async () => {
    versionMaybeSingle.mockResolvedValue({ data: null, error: null })

    await expect(readPolarVersion(ABSENT)).resolves.toBeNull()
    // Not an error: a stale link is the sailor's, not the app's.
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('asks the database nothing about an id that is not a uuid', async () => {
    // `id=eq.version-9` is a 22P02 error, not an empty result, so without the guard a mistyped
    // link would be reported and logged as a read that failed.
    await expect(readPolarVersion('version-9')).resolves.toBeNull()

    expect(from).not.toHaveBeenCalled()
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('refuses to render a stored payload that is not a grid', async () => {
    // The row's own CHECK only requires the three keys to be present. A grid whose rows are not
    // the width of its wind speed axis would draw a table with holes in it, so it is reported as
    // unreadable rather than displayed as a polar with gaps.
    versionMaybeSingle.mockResolvedValue({
      data: { ...V1, payload: { ...GRID, boat_speed: [[3.96], [4.25, 5.66]] } },
      error: null,
    })

    await expect(readPolarVersion(ID1)).resolves.toBeNull()
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('v1'),
      expect.stringContaining('boat_speed')
    )
  })
})

describe('readPolarScreen', () => {
  let consoleError: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    artifactMaybeSingle.mockResolvedValue({
      data: { id: 'artifact-polar', current_version_id: ID2 },
      error: null,
    })
    versionsOrder.mockResolvedValue({ data: [V2, V1], error: null })
    versionMaybeSingle.mockResolvedValue({ data: { ...V2, payload: GRID }, error: null })
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it('gives the screen its list and the grid the pointer is at', async () => {
    const screen = await readPolarScreen()

    expect(screen?.list.versions.map((version) => version.version_number)).toEqual([2, 1])
    expect(screen?.current).toMatchObject({ id: ID2, is_current: true, payload: GRID })
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('finds the artifact once, not once per question', async () => {
    // The pointer comes off the artifact row anyway. Asking for it again to read the grid it
    // names is a second round trip for an answer already in hand.
    await readPolarScreen()

    expect(artifactMaybeSingle).toHaveBeenCalledTimes(1)
  })

  it('reads the grid the pointer names, and only that grid', async () => {
    await readPolarScreen()

    expect(versionMaybeSingle).toHaveBeenCalledTimes(1)
    expect(versionsSelect).toHaveBeenCalledWith(expect.not.stringContaining('payload'))
    expect(versionsSelect).toHaveBeenCalledWith(expect.stringContaining('payload'))
  })

  it('reads no grid at all on an empty archive, and does not call that a failure', async () => {
    artifactMaybeSingle.mockResolvedValue({
      data: { id: 'artifact-polar', current_version_id: null },
      error: null,
    })
    versionsOrder.mockResolvedValue({ data: [], error: null })

    await expect(readPolarScreen()).resolves.toEqual({
      list: { current_version_id: null, versions: [] },
      current: null,
    })
    expect(versionMaybeSingle).not.toHaveBeenCalled()
  })

  it('reports a failed list read as a failed read', async () => {
    versionsOrder.mockResolvedValue({ data: null, error: { message: 'connection reset' } })

    await expect(readPolarScreen()).resolves.toBeNull()
    expect(consoleError).toHaveBeenCalled()
  })

  it('still lists the Versions when the one in force holds no readable grid', async () => {
    // The list is what says a Version is there at all. Losing it because one payload is
    // unreadable would hide the archive to report a fault in one row of it.
    versionMaybeSingle.mockResolvedValue({
      data: { ...V2, payload: { ...GRID, boat_speed: [[3.96]] } },
      error: null,
    })

    const screen = await readPolarScreen()

    expect(screen?.current).toBeNull()
    expect(screen?.list.versions).toHaveLength(2)
    expect(consoleError).toHaveBeenCalled()
  })

  it('degrades to a failed read with no Supabase environment', async () => {
    createClient.mockRejectedValueOnce(new Error('NEXT_PUBLIC_SUPABASE_URL is missing'))

    await expect(readPolarScreen()).resolves.toBeNull()
  })
})
