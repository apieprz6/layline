import { render, screen } from '@testing-library/react'
import PolarGrid from '../PolarGrid'
import type { PolarPayload } from '@/types'

/**
 * A grid with nothing generated in it: no row is a multiple of the one below, so every angle is
 * the boat's own speed and every angle is shown.
 */
const MEASURED: PolarPayload = {
  twa_axis: [52, 60, 75],
  tws_axis: [4, 6],
  boat_speed: [
    [3.96, 5.39],
    [4.25, 5.66],
    [4.4, 5.99],
  ],
  source: { format: 'orc-pol', header_token: 'twa/tws' },
}

/**
 * A grid with the shape a certificate polar actually has: the lowest angles ramped up from one
 * tabulated row — 35 is twice 30, 40 is three times it — and the boat's real speed above them.
 * Handsome Pete's `.pol` does exactly this.
 */
const WITH_FILLER: PolarPayload = {
  twa_axis: [30, 35, 40, 45],
  tws_axis: [6, 10],
  boat_speed: [
    [1, 2],
    [2, 4],
    [3, 6],
    [5.1, 7.32],
  ],
}

function shownAngles(): string[] {
  return screen.getAllByTestId('polar-row').map((row) => row.getAttribute('data-twa') ?? '')
}

describe('the Polar grid', () => {
  it('draws one row per wind angle and one column per wind speed', () => {
    render(<PolarGrid payload={MEASURED} />)

    expect(shownAngles()).toEqual(['52', '60', '75'])
    expect(screen.getAllByRole('columnheader')).toHaveLength(3) // the corner, then 4 and 6
  })

  it('shows every cell as the file wrote it, padded to two decimals and never rounded', () => {
    render(
      <PolarGrid
        payload={{
          ...MEASURED,
          // A cell carrying three decimals: shown in full rather than trimmed to fit the column.
          boat_speed: [[3.96, 5.39], [4.25, 5.664], [4.4, 5.99]],
        }}
      />
    )

    expect(screen.getByText('3.96')).toBeInTheDocument()
    expect(screen.getByText('5.664')).toBeInTheDocument()
  })

  it('pads a whole number rather than leaving it bare, so a column reads as a column', () => {
    render(<PolarGrid payload={{ ...MEASURED, boat_speed: [[4, 5.39], [4.25, 5.66], [4.4, 5.99]] }} />)

    expect(screen.getByText('4.00')).toBeInTheDocument()
  })

  it('labels an axis value exactly as written, with no invented decimal place', () => {
    render(<PolarGrid payload={MEASURED} />)

    // `4 kn` of wind, not `4.0 kn`: an axis is a label, and nobody wrote the extra digit.
    expect(screen.getByRole('columnheader', { name: '4' })).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: '52°' })).toBeInTheDocument()
  })

  it('says it is boat speed and not VMG', () => {
    render(<PolarGrid payload={MEASURED} />)

    // Read as VMG, every downwind figure would look impossibly good.
    expect(screen.getByTestId('polar-grid').textContent).toMatch(/not VMG/)
  })

  it('suppresses the angles the file filled in rather than measured', () => {
    render(<PolarGrid payload={WITH_FILLER} />)

    expect(shownAngles()).toEqual(['45'])
  })

  it('states why those angles are missing rather than omitting them silently', () => {
    render(<PolarGrid payload={WITH_FILLER} />)

    const note = screen.getByTestId('polar-suppression-note')
    expect(note.textContent).toMatch(/45/)
    // What the detector found, not a blanket claim: these rows are a ramp, and the note says so.
    expect(note.textContent).toMatch(/ramps up/i)
    expect(note.textContent).toMatch(/not shown/i)
  })

  it('says nothing about suppression when there is nothing to suppress', () => {
    render(<PolarGrid payload={MEASURED} />)

    expect(screen.queryByTestId('polar-suppression-note')).not.toBeInTheDocument()
  })

  it('decides the suppression itself, so no caller can display the filler by forgetting to', () => {
    // The rule is the grid's own — there is no prop that turns it off, which is what makes
    // "suppressed wherever the grid is displayed" true by construction rather than by review.
    render(<PolarGrid payload={WITH_FILLER} />)

    const grid = screen.getByTestId('polar-grid')
    expect(grid.textContent).not.toMatch(/\b30°/)
    expect(grid.textContent).not.toMatch(/\b35°/)
  })
})
