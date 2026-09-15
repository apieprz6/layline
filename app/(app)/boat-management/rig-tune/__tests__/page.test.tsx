import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CREW } from '@/__tests__/fixtures/accounts'
import type { RigTuneBand, RigTunePage, RigTuneShrouds, RigTuneVersionRecord } from '@/types'

const redirect = jest.fn((to: string) => {
  // The real `redirect()` throws to abandon the render; a mock that returned would let
  // the page fall through into markup it never reaches in Next.
  throw Object.assign(new Error(`NEXT_REDIRECT:${to}`), { digest: 'NEXT_REDIRECT' })
})

jest.mock('next/navigation', () => ({
  redirect: (to: string) => redirect(to),
}))

jest.mock('@/lib/account/resolveAccount', () => ({
  resolveAccount: jest.fn(async () => null),
}))

// What PostgREST is asked for is readRigTune's own suite.
jest.mock('@/services/boat/readRigTune', () => ({
  readRigTune: jest.fn(),
}))

// Never reached from here — no test submits — but the editor imports it, and the real
// module reaches for `next/cache` and a Supabase client.
jest.mock('../actions', () => ({
  saveRigTuneVersion: jest.fn(async () => ({ ok: true })),
}))

import RigTunePageRoute from '../page'

const BOAT = {
  id: 'boat-1',
  name: 'Handsome Pete',
  model: 'Beneteau 10R',
  created_at: '2026-09-10T18:30:00Z',
  updated_at: '2026-09-10T18:30:00Z',
}

function shrouds(v1: number, d1: number, d2: number, turns = 0): RigTuneShrouds {
  const both = (gap: number) => ({
    port: { gap_mm: gap, turns_from_base: turns },
    starboard: { gap_mm: gap, turns_from_base: turns },
  })
  return { V1: both(v1), D1: both(d1), D2: both(d2) }
}

function bandRow(over: Partial<RigTuneBand> = {}): RigTuneBand {
  return {
    id: 'band-base',
    version_id: 'v2',
    kind: 'rig_tune',
    low_kt: 9,
    high_kt: null,
    is_base: true,
    label: 'Mac base',
    note: null,
    gaps_stale: false,
    shrouds: shrouds(72, 64, 61),
    ...over,
  }
}

/** The light band, set off the base by slackening, so its Turns run negative. */
const LIGHT = bandRow({
  id: 'band-light',
  low_kt: 0,
  high_kt: 9,
  is_base: false,
  label: 'Light',
  note: 'Forestay one hole aft.',
  shrouds: shrouds(70, 62, 60, -1.5),
})

const BASE = bandRow({ low_kt: 9, high_kt: null, is_base: true })

function versionRow(over: Partial<RigTuneVersionRecord> = {}): RigTuneVersionRecord {
  return {
    id: 'v2',
    version_number: 2,
    effective_from: '2026-08-01',
    recorded_at: '2026-08-02T14:00:00Z',
    note: 'Re-measured after the shrouds were reset.',
    created_by: CREW.userId,
    bands: [LIGHT, BASE],
    ...over,
  }
}

function page(over: Partial<RigTunePage> = {}): RigTunePage {
  return {
    boat: BOAT,
    artifact_id: 'artifact-rig',
    current_version_id: 'v2',
    versions: [versionRow()],
    ...over,
  }
}

describe('/boat-management/rig-tune', () => {
  const { resolveAccount } = jest.requireMock('@/lib/account/resolveAccount')
  const { readRigTune } = jest.requireMock('@/services/boat/readRigTune')

  beforeEach(() => {
    jest.clearAllMocks()
    resolveAccount.mockResolvedValue(CREW)
    readRigTune.mockResolvedValue(page())
  })

  async function renderPage(params: Record<string, string> = {}): Promise<HTMLElement> {
    // Next 16 hands a page its searchParams as a promise.
    const { container } = render(await RigTunePageRoute({ searchParams: Promise.resolve(params) }))
    return container
  }

  it('serves a Guest nothing, and sends them to sign in with this route kept', async () => {
    resolveAccount.mockResolvedValue(null)

    await expect(RigTunePageRoute({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'NEXT_REDIRECT'
    )

    expect(redirect).toHaveBeenCalledWith('/?signin=%2Fboat-management%2Frig-tune')
    expect(document.body.textContent).toBe('')
    expect(readRigTune).not.toHaveBeenCalled()
  })

  it('names the artifact and the Version in force, and says when it took effect', async () => {
    await renderPage()

    expect(screen.getByRole('heading', { name: 'Rig Tune' })).toBeInTheDocument()
    expect(screen.getByTestId('shown-version')).toHaveTextContent('v2')
    expect(screen.getByTestId('shown-version-effective')).toHaveTextContent('effective 1 Aug 2026')
    expect(screen.getByText('Re-measured after the shrouds were reset.')).toBeInTheDocument()
  })

  it('never offers a file: no filename, no upload, no download', async () => {
    // ADR 0007: a Rig Tune is typed into a form. There is nothing to attach and nothing
    // to fetch, so any of those three words on this screen would be a promise it breaks.
    const rendered = await renderPage()

    expect(rendered.textContent).not.toMatch(/upload|download|\.rig\b|file/i)
    expect(rendered.querySelector('input[type="file"]')).toBeNull()
  })

  it('reads the bands up the wind axis, each with the speeds it covers', async () => {
    await renderPage()

    const bands = screen.getAllByTestId('rig-tune-band')
    expect(bands).toHaveLength(2)
    expect(bands[0]).toHaveTextContent('0–9 kt')
    expect(bands[0]).toHaveTextContent('Light')
    // The open top band reads as words rather than a dangling edge.
    expect(bands[1]).toHaveTextContent('9 kt and up')
  })

  it('marks the Base Tune by its flag, and marks only it', async () => {
    // Never by position: the base is the band the Turns are counted from, and on this
    // boat it is the *second* band up the axis (ADR 0007).
    await renderPage()

    const marks = screen.getAllByTestId('base-tune-mark')
    expect(marks).toHaveLength(1)
    expect(screen.getAllByTestId('rig-tune-band')[1]).toContainElement(marks[0])
  })

  it('shows both encodings for all three positions on both sides', async () => {
    await renderPage()

    const light = screen.getAllByTestId('rig-tune-band')[0]

    for (const position of ['V1', 'D1', 'D2']) {
      expect(light).toHaveTextContent(position)
    }
    // The gap in mm and the turns off the base, because neither derives from the other:
    // no thread pitch is recorded (ADR 0007).
    expect(light).toHaveTextContent('70')
    expect(light).toHaveTextContent('62')
    expect(light).toHaveTextContent('60')
    expect(light.querySelectorAll('[data-testid="shroud-side"]')).toHaveLength(6)
    // Slack side of the base, at the half-turn resolution it was recorded in.
    expect(light).toHaveTextContent('−1½')
  })

  it('shows the Base Tune’s own Turns as 0, because that is where they are counted from', async () => {
    await renderPage()

    const base = screen.getAllByTestId('rig-tune-band')[1]
    expect(base).toHaveTextContent('72')
    expect(base.textContent).not.toMatch(/[+−]/)
  })

  it('says a band’s Gaps are stale, and says it of the whole table too', async () => {
    // Re-measuring the base leaves every other band's millimetres describing a rig that
    // no longer exists. Nothing is recomputed and nothing is hidden — it is labelled.
    readRigTune.mockResolvedValue(
      page({ versions: [versionRow({ bands: [{ ...LIGHT, gaps_stale: true }, BASE] })] })
    )

    await renderPage()

    expect(screen.getByTestId('gaps-stale-banner')).toBeInTheDocument()
    const marks = screen.getAllByTestId('gaps-stale-mark')
    expect(marks).toHaveLength(1)
    expect(screen.getAllByTestId('rig-tune-band')[0]).toContainElement(marks[0])
  })

  it('says nothing about staleness when every band was measured under this base', async () => {
    await renderPage()

    expect(screen.queryByTestId('gaps-stale-banner')).not.toBeInTheDocument()
    expect(screen.queryAllByTestId('gaps-stale-mark')).toHaveLength(0)
  })

  it('shows a viewer every Version and no way to write one', async () => {
    // ADR 0019: the Role governs writes only. A viewer reads the whole history.
    resolveAccount.mockResolvedValue({ ...CREW, role: 'viewer' })

    await renderPage()

    expect(screen.getAllByTestId('rig-tune-band')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /record|edit|save/i })).not.toBeInTheDocument()
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
  })

  it('says plainly when the Rig Tune could not be read, and shows no bands', async () => {
    readRigTune.mockResolvedValue(null)

    const rendered = await renderPage()

    expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    expect(screen.queryAllByTestId('rig-tune-band')).toHaveLength(0)
    expect(rendered.textContent).not.toMatch(/72|Mac base/)
    // And it does not also claim the tune is *unrecorded*. "Not recorded" is an answer
    // about the boat; a failed read is an answer about Layline, and asserting the first
    // when only the second is known is the invention the core belief rules out.
    expect(screen.queryByTestId('not-recorded')).not.toBeInTheDocument()
  })

  it('lists every Version, newest first, and marks the one in force', async () => {
    // A Race freezes a pointer at the Version the boat was set to, and that pointer is
    // worthless if the Version it names cannot be opened (ADR 0007).
    readRigTune.mockResolvedValue(
      page({
        versions: [
          versionRow(),
          versionRow({ id: 'v1', version_number: 1, effective_from: '2026-05-04', created_by: 'someone-else' }),
        ],
      })
    )

    await renderPage()

    const history = screen.getAllByTestId('rig-tune-version')
    expect(history).toHaveLength(2)
    expect(history[0]).toHaveTextContent('v2')
    expect(history[1]).toHaveTextContent('v1')
    expect(history[0]).toHaveTextContent(/in force/i)
    expect(history[1]).not.toHaveTextContent(/in force/i)
  })

  it('says “by you” of the reader’s own Versions and of nobody else’s', async () => {
    readRigTune.mockResolvedValue(
      page({
        versions: [
          versionRow(),
          versionRow({ id: 'v1', version_number: 1, created_by: 'another-admin' }),
        ],
      })
    )

    await renderPage()

    const history = screen.getAllByTestId('rig-tune-version')
    expect(history[0]).toHaveTextContent(/by you/i)
    // No name is invented for the other admin: the row carries a uuid, and this screen
    // has no reader of `profiles` to turn one into a person.
    expect(history[1]).not.toHaveTextContent(/by you/i)
    expect(history[1].textContent).not.toMatch(/another-admin/)
  })

  it('opens a past Version when the query names one, and says it is not in force', async () => {
    readRigTune.mockResolvedValue(
      page({
        versions: [
          versionRow(),
          versionRow({
            id: 'v1',
            version_number: 1,
            effective_from: '2026-05-04',
            note: 'First tune measured off the boat.',
            bands: [bandRow({ id: 'v1-base', low_kt: 0, high_kt: null, label: 'As delivered' })],
          }),
        ],
      })
    )

    await renderPage({ version: '1' })

    expect(screen.getByTestId('shown-version')).toHaveTextContent('v1')
    expect(screen.getByTestId('shown-version-effective')).toHaveTextContent('4 May 2026')
    expect(screen.getAllByTestId('rig-tune-band')).toHaveLength(1)
    expect(screen.getByTestId('past-version-notice')).toBeInTheDocument()
  })

  it('offers no way to edit a past Version, even to an admin', async () => {
    // The pointer moves forward only: a past Version is testimony, and the way to change
    // the rig is to measure it and mint the next one (ADR 0007).
    resolveAccount.mockResolvedValue({ ...CREW, role: 'admin' })
    readRigTune.mockResolvedValue(
      page({ versions: [versionRow(), versionRow({ id: 'v1', version_number: 1 })] })
    )

    await renderPage({ version: '1' })

    expect(screen.queryByRole('button', { name: /record|save/i })).not.toBeInTheDocument()
  })

  it('falls back to the Version in force when the query names one that does not exist', async () => {
    const rendered = await renderPage({ version: '9' })

    expect(screen.getByTestId('shown-version')).toHaveTextContent('v2')
    expect(screen.queryByTestId('past-version-notice')).not.toBeInTheDocument()
    // And nothing claims a v9 was found.
    expect(rendered.textContent).not.toMatch(/v9/)
  })

  describe('the admin’s editor', () => {
    beforeEach(() => {
      resolveAccount.mockResolvedValue({ ...CREW, role: 'admin' })
    })

    async function open(params: Record<string, string> = {}): Promise<void> {
      await renderPage(params)
      await userEvent.click(screen.getByRole('button', { name: /record a new version/i }))
    }

    it('opens seeded with the tune in force, so a retune is an edit of what is there', async () => {
      await open()

      const bands = screen.getAllByTestId('rig-tune-band-fields')
      expect(bands).toHaveLength(2)
      expect(within(bands[0]).getByLabelText(/D1 port Turnbuckle Gap/i)).toHaveValue('62')
      expect(within(bands[0]).getByLabelText(/D1 port Turns From Base/i)).toHaveValue('-1.5')
      // The date and the reason are this Version's own, so neither is inherited.
      expect(screen.getByLabelText(/took effect/i)).toHaveValue('')
      expect(screen.getByLabelText(/why this version/i)).toHaveValue('')
    })

    it('offers no way to save until something has changed', async () => {
      // Opening the form cannot mint a Version, and an unchanged table is not a retune.
      await open()

      expect(screen.getByRole('button', { name: /^save/i })).toBeDisabled()
      expect(screen.queryByTestId('rig-tune-dirty-banner')).not.toBeInTheDocument()
    })

    it('says the whole tune is unsaved, once, however many bands were touched', async () => {
      // ADR 0007: the dirty state is table-wide, because a Version is the whole table. The
      // design's "Unsaved tune changes in this band" was the bug being fixed.
      await open()

      const bands = screen.getAllByTestId('rig-tune-band-fields')
      await userEvent.clear(within(bands[0]).getByLabelText(/V1 port Turnbuckle Gap/i))
      await userEvent.type(within(bands[0]).getByLabelText(/V1 port Turnbuckle Gap/i), '71')
      await userEvent.clear(within(bands[1]).getByLabelText(/V1 port Turnbuckle Gap/i))
      await userEvent.type(within(bands[1]).getByLabelText(/V1 port Turnbuckle Gap/i), '73')

      const banners = screen.getAllByTestId('rig-tune-dirty-banner')
      expect(banners).toHaveLength(1)
      expect(banners[0].textContent).not.toMatch(/this band/i)
      expect(screen.getByRole('button', { name: /^save/i })).toBeEnabled()
    })

    it('steps Turns From Base in half turns, the finest a turnbuckle is set by hand', async () => {
      await open()

      const light = screen.getAllByTestId('rig-tune-band-fields')[0]
      const turns = within(light).getByLabelText(/V1 port Turns From Base/i)
      expect(turns).toHaveValue('-1.5')

      await userEvent.click(within(light).getByRole('button', { name: /V1 port half a turn tighter/i }))
      expect(turns).toHaveValue('-1')

      await userEvent.click(within(light).getByRole('button', { name: /V1 port half a turn slacker/i }))
      expect(turns).toHaveValue('-1.5')
    })

    it('offers no mirror between the sides', async () => {
      // "Match sides" copied port onto starboard only, which asserts port is the truth. A
      // rig is measured side by side, so the control is dropped rather than made two-way.
      const rendered = await renderPage()
      await userEvent.click(screen.getByRole('button', { name: /record a new version/i }))

      expect(rendered.textContent).not.toMatch(/match sides|mirror/i)
    })

    it('sends the typed table to the server and shows what it refused', async () => {
      const { saveRigTuneVersion } = jest.requireMock('../actions')
      saveRigTuneVersion.mockResolvedValue({
        ok: false,
        message: 'This tune is not ready to save.',
        problems: [{ band_key: null, message: 'Say why this Version exists.' }],
      })

      await open()
      await userEvent.type(screen.getByLabelText(/took effect/i), '2026-09-15')
      await userEvent.click(screen.getByRole('button', { name: /^save/i }))

      expect(saveRigTuneVersion).toHaveBeenCalledTimes(1)
      const draft = saveRigTuneVersion.mock.calls[0][0]
      expect(draft.effective_from).toBe('2026-09-15')
      expect(draft.bands).toHaveLength(2)
      // Each band carries what it was measured under, which is what decides staleness: the
      // base's own Gaps, and that it was the base when they were taken.
      expect(draft.bands[1].seed.shrouds.V1.port.gap_mm).toBe(72)
      expect(draft.bands[1].seed.was_base).toBe(true)

      expect(screen.getByText('Say why this Version exists.')).toBeInTheDocument()
    })

    it('takes back every edit when the sailor reverts, and nothing is left half-changed', async () => {
      await open()

      const light = screen.getAllByTestId('rig-tune-band-fields')[0]
      await userEvent.clear(within(light).getByLabelText(/V1 port Turnbuckle Gap/i))
      await userEvent.type(within(light).getByLabelText(/V1 port Turnbuckle Gap/i), '71')
      await userEvent.click(screen.getByRole('button', { name: /revert/i }))

      // Nothing is persisted as a draft, so reverting is closing the form.
      expect(screen.queryByTestId('rig-tune-dirty-banner')).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/V1 port Turnbuckle Gap/i)).not.toBeInTheDocument()
    })

    it('starts an unrecorded Rig Tune as one empty Base Tune band from 0 kt', async () => {
      readRigTune.mockResolvedValue(page({ current_version_id: null, versions: [] }))

      await open()

      const bands = screen.getAllByTestId('rig-tune-band-fields')
      expect(bands).toHaveLength(1)
      // No figures: there is no seed, and a guide's published numbers stored as v1 would be
      // indistinguishable from a measurement of this rig (ADR 0007).
      expect(within(bands[0]).getByLabelText(/V1 port Turnbuckle Gap/i)).toHaveValue('')
      expect(within(bands[0]).getByLabelText(/starts at/i)).toHaveValue('0')
    })

    it('counts every band off the new Base Tune when the flag is moved', async () => {
      // Turns From Base are signed against whichever band carries the flag, so moving it
      // has to re-express them: subtracting the new base's own Turns is arithmetic inside
      // one encoding, and it leaves every band set exactly where it was. Left counted off
      // the old base, the same figures would quietly mean something else.
      await open()

      const [light, base] = screen.getAllByTestId('rig-tune-band-fields')
      await userEvent.click(within(light).getByLabelText(/base tune/i))

      expect(within(light).getByLabelText(/V1 port Turns From Base/i)).toHaveValue('0')
      expect(within(light).getByLabelText(/D2 starboard Turns From Base/i)).toHaveValue('0')
      // The old base sat 1½ turns tighter than this band, and still does.
      expect(within(base).getByLabelText(/V1 port Turns From Base/i)).toHaveValue('1.5')
      // A Gap is a caliper reading of a turnbuckle, not a figure relative to anything, so
      // nothing about it moves.
      expect(within(base).getByLabelText(/V1 port Turnbuckle Gap/i)).toHaveValue('72')
    })

    it('adds and removes bands, and lets exactly one of them be the Base Tune', async () => {
      await open()

      await userEvent.click(screen.getByRole('button', { name: /add a band/i }))
      expect(screen.getAllByTestId('rig-tune-band-fields')).toHaveLength(3)

      // One flag, so choosing a new base clears the old one — never two, never none.
      const added = screen.getAllByTestId('rig-tune-band-fields')[2]
      await userEvent.click(within(added).getByLabelText(/base tune/i))
      expect(screen.getAllByRole('radio', { checked: true })).toHaveLength(1)

      await userEvent.click(within(added).getByRole('button', { name: /remove this band/i }))
      expect(screen.getAllByTestId('rig-tune-band-fields')).toHaveLength(2)
    })
  })

  it('shows an unrecorded Rig Tune as not recorded, not as loading', async () => {
    readRigTune.mockResolvedValue(page({ current_version_id: null, versions: [] }))

    const rendered = await renderPage()

    // There is no seed: v1 is the owner's own measured tune, so an empty artifact is
    // genuinely empty rather than waiting on something (ADR 0007).
    expect(screen.getByTestId('not-recorded')).toBeInTheDocument()
    expect(rendered.querySelector('[aria-busy="true"]')).toBeNull()
    expect(rendered.textContent).not.toMatch(/loading|72 mm/i)
  })
})
