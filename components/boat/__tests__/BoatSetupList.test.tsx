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
    render(<BoatSetupList artifacts={EMPTY} canWrite={false} />)

    const names = screen.getAllByTestId('artifact-name').map((el) => el.textContent)
    expect(names).toEqual(['Polar', 'Crossover Chart', 'Rig Tune', 'Instrument Calibration'])
  })

  it('says "not recorded" against each one on an empty database', () => {
    render(<BoatSetupList artifacts={EMPTY} canWrite={false} />)
    expect(screen.getAllByTestId('not-recorded')).toHaveLength(4)
  })

  it('states the Version in force by number and effective date', () => {
    render(
      <BoatSetupList
        canWrite={false}
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
        canWrite={false}
        artifacts={withCurrent('crossover_chart', {
          version_number: 1,
          effective_from: '2026-05-02',
        })}
      />
    )

    expect(screen.getByRole('link', { name: /Crossover Chart/ })).toHaveAttribute(
      'href',
      '/boat-management/crossover-chart'
    )
  })

  it('leaves an unrecorded artifact inert for a viewer — there is nothing to open', () => {
    render(<BoatSetupList artifacts={EMPTY} canWrite={false} />)

    // The same choice LAY-102 made for a locked drawer row: a row that leads
    // nowhere is not dressed as a control. A viewer cannot record a first Version,
    // so an unrecorded artifact holds nothing for them either way.
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('opens the Rig Tune for an admin before anything is recorded', () => {
    // Otherwise the first Version can never be typed: the Rig Tune is a form, so its
    // screen is where an unrecorded artifact stops being unrecorded, and a row that
    // waits for a Version to exist waits forever.
    render(<BoatSetupList artifacts={EMPTY} canWrite />)

    expect(screen.getByRole('link', { name: /Rig Tune/ })).toHaveAttribute(
      'href',
      '/boat-management/rig-tune'
    )
    // Only that one. The other three have no screen to open yet (LAY-106, LAY-108),
    // and a row leading to a 404 is worse than an inert one.
    expect(screen.getAllByRole('link')).toHaveLength(1)
    // And it still says what it is: an admin is being shown an empty form to fill,
    // not a Version that exists.
    expect(screen.getAllByTestId('not-recorded')).toHaveLength(4)
  })

  it('offers no upload or download anywhere, on any row', () => {
    render(
      <BoatSetupList
        canWrite={false}
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

    // This ticket ships the list and the empty states; the upload and the form
    // flows are LAY-106 to LAY-108. A Rig Tune and an Instrument Calibration have
    // no file behind them at all, so no filename and no Download can ever appear
    // on those two — the mockup's `Wayward_Wind.rig` is the mistake being avoided.
    const list = screen.getByTestId('boat-setup-list')
    expect(list.textContent).not.toMatch(/download|upload|refit/i)
    expect(list.textContent).not.toMatch(/\.(rig|cal|csv|pol)\b/i)
  })

  it('carries no placeholder identity copy, and no fifth artifact by name', () => {
    render(<BoatSetupList artifacts={EMPTY} canWrite={false} />)
    expect(screen.getByTestId('boat-setup-list').textContent).not.toMatch(
      /Wayward Wind|J\/105|Sail Definitions/
    )
  })

  it('is four artifacts, not five — Sail Definitions belong to the Crossover Chart', () => {
    render(<BoatSetupList artifacts={EMPTY} canWrite={false} />)
    // ADR 0012: a Crossover Chart carries its own Sail Definitions, which is why
    // there are four Version pointers and not five.
    expect(screen.getAllByTestId('artifact-name')).toHaveLength(4)
  })
})
