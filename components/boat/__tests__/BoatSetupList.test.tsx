import { render, screen } from '@testing-library/react'
import BoatSetupList from '../BoatSetupList'
import { BOAT_SETUP_ORDER } from '@/lib/boat/artifacts'
import type { BoatSetupKind, BoatSetupRow, CurrentBoatSetupVersion } from '@/types'

/** The state the app ships in: four artifacts, no Version behind any of them. */
const EMPTY: BoatSetupRow[] = BOAT_SETUP_ORDER.map((kind) => ({ kind, current: null }))

function withCurrent(kind: BoatSetupKind, current: CurrentBoatSetupVersion): BoatSetupRow[] {
  return EMPTY.map((row) => (row.kind === kind ? { ...row, current } : row))
}

describe('the Boat Setup list', () => {
  it('lists the four artifacts, in reading order', () => {
    render(<BoatSetupList artifacts={EMPTY} />)

    const names = screen.getAllByTestId('artifact-name').map((el) => el.textContent)
    expect(names).toEqual(['Polar', 'Crossover Chart', 'Rig Tune', 'Instrument Calibration'])
  })

  it('says "not recorded" against each one on an empty database', () => {
    render(<BoatSetupList artifacts={EMPTY} />)
    expect(screen.getAllByTestId('not-recorded')).toHaveLength(4)
  })

  it('states the Version in force by number and effective date', () => {
    render(
      <BoatSetupList
        artifacts={withCurrent('polar', { version_number: 2, effective_from: '2026-06-14' })}
      />
    )

    expect(screen.getByText('v2 · effective 14 Jun 2026')).toBeInTheDocument()
    // And only that row has one — the other three are still empty.
    expect(screen.getAllByTestId('not-recorded')).toHaveLength(3)
  })

  it('opens a recorded artifact to its own detail', () => {
    render(
      <BoatSetupList
        artifacts={withCurrent('polar', { version_number: 1, effective_from: '2026-05-02' })}
      />
    )

    expect(screen.getByRole('link', { name: /Polar/ })).toHaveAttribute(
      'href',
      '/boat-management/polar'
    )
  })

  it('opens the Crossover Chart, whose screen is the last of the four to land', () => {
    render(
      <BoatSetupList
        artifacts={withCurrent('crossover_chart', {
          version_number: 1,
          effective_from: '2026-05-02',
        })}
      />
    )

    expect(screen.getByText('v1 · effective 2 May 2026')).toBeInTheDocument()
    // One Version for both halves, so one row and one link: the Sail Definitions are
    // inside this artifact rather than beside it (ADR 0012).
    expect(screen.getByRole('link', { name: /Crossover Chart/ })).toHaveAttribute(
      'href',
      '/boat-management/crossover-chart'
    )
  })

  it('opens an artifact with a detail screen even before its first Version', () => {
    render(<BoatSetupList artifacts={EMPTY} />)

    // Gating this on a Version would leave the archive the app ships in — four
    // artifacts, none recorded — with no way to fill itself, because entering the
    // first Version is one of the things that screen is for.
    expect(screen.getByRole('link', { name: /Instrument Calibration/ })).toHaveAttribute(
      'href',
      '/boat-management/instrument-calibration'
    )
  })

  it('opens the Rig Tune before anything is recorded, for the same reason', () => {
    render(<BoatSetupList artifacts={EMPTY} />)

    // A Rig Tune is a form and has no file behind it (ADR 0007), so its screen is
    // where an unrecorded artifact stops being unrecorded — and a row that waits for
    // a Version before it opens waits forever.
    expect(screen.getByRole('link', { name: /Rig Tune/ })).toHaveAttribute(
      'href',
      '/boat-management/rig-tune'
    )
    // And the row still says what it is: an empty form is being offered, not a Version.
    expect(screen.getAllByTestId('not-recorded')).toHaveLength(4)
  })

  it('opens the Polar with nothing recorded, which is where the first upload is made', () => {
    // Otherwise the first upload is unreachable: the Polar screen is where a Polar is
    // uploaded, and with no Version there would be no row to open it from.
    render(<BoatSetupList artifacts={EMPTY} />)

    const polar = screen.getByRole('link', { name: /Polar/ })
    expect(polar).toHaveAttribute('href', '/boat-management/polar')
    // And it still says the truth about the artifact on the way through.
    expect(polar.textContent).toMatch(/Not recorded/)
  })

  it('opens all four rows, and offers no button anywhere', () => {
    render(<BoatSetupList artifacts={EMPTY} />)

    // Every artifact has a detail screen now, so the gate that kept an unbuilt row
    // inert — LAY-102's rule that a row leading nowhere is not dressed as a control —
    // has nothing left to hold back. Opening a row is still a navigation and never a
    // button: the writes live on the screen at the other end.
    expect(screen.queryAllByRole('link')).toHaveLength(4)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('offers no upload or download anywhere, on any row', () => {
    render(
      <BoatSetupList
        artifacts={[
          { kind: 'polar', current: { version_number: 1, effective_from: '2026-05-02' } },
          {
            kind: 'crossover_chart',
            current: { version_number: 1, effective_from: '2026-05-02' },
          },
          { kind: 'rig_tune', current: { version_number: 1, effective_from: '2026-08-20' } },
          {
            kind: 'instrument_calibration',
            current: { version_number: 3, effective_from: '2026-07-04' },
          },
        ]}
      />
    )

    // The uploads and the form flows live on the detail screens, not here. A Rig Tune
    // and an Instrument Calibration have no file behind them at all, so no filename and
    // no Download can ever appear on those two — the mockup's `Wayward_Wind.rig` is the
    // mistake being avoided.
    const list = screen.getByTestId('boat-setup-list')
    expect(list.textContent).not.toMatch(/download|upload|refit/i)
    expect(list.textContent).not.toMatch(/\.(rig|cal|csv|pol)\b/i)
  })

  it('carries no placeholder identity copy, and no fifth artifact by name', () => {
    render(<BoatSetupList artifacts={EMPTY} />)
    expect(screen.getByTestId('boat-setup-list').textContent).not.toMatch(
      /Wayward Wind|J\/105|Sail Definitions/
    )
  })

  it('is four artifacts, not five — Sail Definitions belong to the Crossover Chart', () => {
    render(<BoatSetupList artifacts={EMPTY} />)
    // ADR 0012: a Crossover Chart carries its own Sail Definitions, which is why
    // there are four Version pointers and not five.
    expect(screen.getAllByTestId('artifact-name')).toHaveLength(4)
  })
})
