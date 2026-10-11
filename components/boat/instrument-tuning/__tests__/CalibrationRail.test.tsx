/**
 * The Calibration Log's dates, as dashed rules on each chart.
 *
 * ADR 0032's rule, and the one cross-channel mark in the whole screen: the Apparent Wind Asymmetry
 * chart also marks `HDG` acts, because compass deviation leaks into the recomputed wind columns and
 * without the mark the check that separates a compass-driven asymmetry from a masthead-driven one
 * cannot be made where the asymmetry is shown.
 */

import { render, screen } from '@testing-library/react'
import CalibrationRail, { type RailRace } from '@/components/boat/instrument-tuning/CalibrationRail'
import { buildCalibrationLog } from '@/lib/boat/calibrationLog'
import type { CalibrationChannel, InstrumentCalibrationPayload, InstrumentCalibrationVersion } from '@/types'

import { event } from './fixtures'

const AUTOCOMPENSATION = event('2026-07-04', ['HDG'], 'autocompensation')
const PADDLEWHEEL = event('2026-06-20', ['STW'])
const MASTHEAD = event('2026-05-10', ['AWA'])

const PAYLOAD: InstrumentCalibrationPayload = {
  AWA: { offset: 2 },
  AWS: { multiplier: 1.02, offset: 0 },
  STW: { multiplier: 1.02, offset: 0 },
  HDG: { offset: 0 },
}

const VERSION: InstrumentCalibrationVersion = {
  id: 'v1',
  artifact_id: 'artifact-1',
  kind: 'instrument_calibration',
  version_number: 1,
  effective_from: '2026-04-01',
  recorded_at: '2026-04-01T12:00:00Z',
  note: null,
  created_by: 'admin-1',
  filename: null,
  content_sha256: null,
  payload: PAYLOAD,
}

const RACES: RailRace[] = [
  { race_id: 'race-may', sailed_at: '2026-05-20 19:00:00', measured: true },
  { race_id: 'race-june', sailed_at: '2026-06-24 19:00:00', measured: true },
  { race_id: 'race-july', sailed_at: '2026-07-10 19:00:00', measured: false },
]

function renderRail(channel: CalibrationChannel, log = buildCalibrationLog([], [AUTOCOMPENSATION, PADDLEWHEEL, MASTHEAD])) {
  return render(
    <CalibrationRail
      channel={channel}
      log={log}
      races={RACES}
      labels={{ 'race-may': '20 May · Beer-can' }}
    />
  )
}

/** The dates the rail drew a rule at, in the order it drew them. */
function markedDates(): string[] {
  return screen.getAllByTestId('calibration-mark').map((mark) => mark.dataset.date ?? '')
}

describe('a channel’s own acts', () => {
  it('draws one dashed rule per Calibration Log date touching the channel', () => {
    renderRail('STW')

    expect(markedDates()).toEqual(['2026-06-20'])
    expect(screen.getByTestId('calibration-mark').querySelector('line')).toHaveAttribute(
      'stroke-dasharray'
    )
  })

  it('labels the rule with its day and what happened', () => {
    renderRail('HDG')

    expect(screen.getByTestId('calibration-rail-HDG')).toHaveTextContent('4 Jul · swung')
  })

  it('marks a Version that moved the channel’s figures, not only an Event', () => {
    renderRail('STW', buildCalibrationLog([VERSION], [PADDLEWHEEL]))

    // The first Version states every figure, including this channel's, and is a boundary: before
    // it, the numbers in the box were whatever they were and nobody wrote them down.
    expect(markedDates()).toEqual(['2026-04-01', '2026-06-20'])
    expect(screen.getByTestId('calibration-rail-STW')).toHaveTextContent('1 Apr · first recorded')
  })

  it('draws no rule for an act on another channel', () => {
    renderRail('STW')

    // No other channel's history has any bearing on a paddlewheel.
    expect(markedDates()).not.toContain('2026-07-04')
    expect(markedDates()).not.toContain('2026-05-10')
  })

  it('treats two acts on one day as one rule, naming both', () => {
    renderRail('STW', buildCalibrationLog([{ ...VERSION, effective_from: '2026-06-20' }], [PADDLEWHEEL]))

    expect(markedDates()).toEqual(['2026-06-20'])
    expect(screen.getByTestId('calibration-rail-STW')).toHaveTextContent(
      '20 Jun · first recorded + other'
    )
  })
})

describe('the one cross-channel mark', () => {
  it('marks HDG acts on the Apparent Wind Asymmetry chart as well as AWA’s own', () => {
    renderRail('AWA')

    expect(markedDates()).toEqual(['2026-05-10', '2026-07-04'])
  })

  it('names the channel on the borrowed rule, so it cannot be read as a masthead event', () => {
    renderRail('AWA')

    const rail = screen.getByTestId('calibration-rail-AWA')
    expect(rail).toHaveTextContent('4 Jul · HDG swung')
    // And AWA's own rule carries no channel name, which is what distinguishes the two.
    expect(rail).toHaveTextContent('10 May · other')
    expect(rail).not.toHaveTextContent('10 May · AWA')
  })

  it('draws the borrowed rule muted, and the chart’s own at full weight', () => {
    renderRail('AWA')

    const [own, borrowed] = screen.getAllByTestId('calibration-mark')
    expect(own.querySelector('line')).toHaveAttribute('stroke', 'var(--text-primary)')
    expect(borrowed.querySelector('line')).toHaveAttribute('stroke', 'var(--text-muted)')
  })

  it('keeps a day both channels were touched as the chart’s own rule', () => {
    renderRail('AWA', buildCalibrationLog([], [event('2026-07-04', ['AWA']), AUTOCOMPENSATION]))

    const mark = screen.getByTestId('calibration-mark')
    expect(mark.dataset.date).toBe('2026-07-04')
    expect(mark.querySelector('line')).toHaveAttribute('stroke', 'var(--text-primary)')
  })

  it('crosses nowhere else: the compass borrows nothing', () => {
    renderRail('HDG')

    expect(markedDates()).toEqual(['2026-07-04'])
  })
})

describe('a Log with nothing in it', () => {
  it('says there is one Era over the whole archive rather than drawing nothing', () => {
    renderRail('STW', [])

    // ADR 0032's correct failure, said out loud: until the owner records an act there is one Era,
    // and a boundary is never inferred from a step in the data.
    expect(screen.queryAllByTestId('calibration-mark')).toHaveLength(0)
    expect(screen.getByTestId('calibration-rail-STW')).toHaveTextContent(
      'Nothing in the Calibration Log touches STW — one Calibration Era over the whole archive, since a boundary is never inferred from a step in the data.'
    )
  })
})

describe('the Races on the rail', () => {
  it('draws every Race, including the ones this check got no figure from', () => {
    const { container } = renderRail('HDG')

    expect(container.querySelectorAll('circle')).toHaveLength(3)
  })

  it('draws a Race with no figure hollow, never as a point at zero or a gap', () => {
    const { container } = renderRail('HDG')
    const hollow = [...container.querySelectorAll('circle')].filter(
      (circle) => circle.getAttribute('fill') === 'var(--surface-raised)'
    )

    expect(hollow).toHaveLength(1)
    expect(hollow[0].querySelector('title')?.textContent).toContain('no figure')
  })

  it('names a Race by its label where it has one, and by its date where it does not', () => {
    const { container } = renderRail('HDG')
    // The rules carry a `<title>` of their own now, so this reads the Races' circles rather than
    // every title on the rail.
    const titles = [...container.querySelectorAll('circle > title')].map(
      (title) => title.textContent
    )

    expect(titles[0]).toBe('20 May · Beer-can')
    expect(titles[1]).toBe('24 Jun')
  })

  it('explains each rule on the rule itself, rather than in a paragraph underneath', () => {
    renderRail('AWA')
    const [own, borrowed] = screen.getAllByTestId('calibration-mark')

    expect(own.querySelector('title')?.textContent).toBe(
      '10 May: other. Races to the left were sailed before it.'
    )
    // A borrowed rule says whose act it was and why it is on this chart at all.
    expect(borrowed.querySelector('title')?.textContent).toBe(
      '4 Jul: an act on HDG, which could have moved this figure. Races to the left were sailed before it.'
    )
  })
})
