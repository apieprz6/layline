/**
 * **Calibration Eras**, as the rules that cut them.
 *
 * Every figure the Instrument Tuning screen reports belongs to exactly one Era, so a boundary in
 * the wrong place is two instrument configurations averaged together — and a boundary that should
 * be there and isn't is the same thing, silently.
 */

import { buildCalibrationLog } from '@/lib/boat/calibrationLog'
import { byEra, calibrationEras, eraOf } from '@/services/analysis/calibration-eras'
import type {
  CalibrationEvent,
  InstrumentCalibrationPayload,
  InstrumentCalibrationVersion,
} from '@/types'

const BASE: InstrumentCalibrationPayload = {
  AWA: { offset: 2 },
  AWS: { multiplier: 1.02, offset: 0 },
  STW: { multiplier: 1.02, offset: 0 },
  HDG: { offset: 0 },
}

function version(
  n: number,
  effective_from: string,
  payload: InstrumentCalibrationPayload
): InstrumentCalibrationVersion {
  return {
    id: `v${n}`,
    artifact_id: 'artifact-1',
    kind: 'instrument_calibration',
    version_number: n,
    effective_from,
    recorded_at: `2026-0${n}-01T12:00:00Z`,
    note: null,
    created_by: 'admin-1',
    filename: null,
    content_sha256: null,
    payload,
  }
}

function event(
  occurred_on: string,
  channels: CalibrationEvent['channels'],
  type: CalibrationEvent['type'] = 'other'
): CalibrationEvent {
  return {
    id: `event-${occurred_on}-${channels.join('')}`,
    artifact_id: 'artifact-1',
    kind: 'instrument_calibration',
    occurred_on,
    type,
    channels,
    note: 'something was done',
    created_by: 'admin-1',
    created_at: `${occurred_on}T02:00:00Z`,
    updated_at: `${occurred_on}T02:00:00Z`,
  }
}

/** The archive's one real act on the compass. */
const AUTOCOMPENSATION = event('2026-07-04', ['HDG'], 'autocompensation')

describe('cutting one channel’s Eras out of the Calibration Log', () => {
  it('is one unbounded Era where nothing was ever recorded', () => {
    const eras = calibrationEras([], 'HDG')

    // Not zero Eras: a season nobody wrote a calibration down for is still a season under some
    // configuration, and every figure in it belongs to that one.
    expect(eras).toHaveLength(1)
    expect(eras[0]).toMatchObject({ from_date: null, until_date: null, opened_by: [] })
  })

  it('opens an Era on each recorded act, and keeps the stretch before the first one', () => {
    const eras = calibrationEras(buildCalibrationLog([], [AUTOCOMPENSATION]), 'HDG')

    expect(eras.map((era) => [era.from_date, era.until_date])).toEqual([
      [null, '2026-07-04'],
      ['2026-07-04', null],
    ])
    expect(eras[1].opened_by.map((entry) => entry.entry)).toEqual(['event'])
  })

  it('ignores an act on another channel, because Eras are per channel', () => {
    const log = buildCalibrationLog([], [event('2026-07-04', ['STW'])])

    // A paddlewheel cleaned says nothing about the compass, and a shared timeline would partition
    // the compass's figures at a date nothing happened to it.
    expect(calibrationEras(log, 'HDG')).toHaveLength(1)
    expect(calibrationEras(log, 'STW')).toHaveLength(2)
  })

  it('counts a Version that moved the channel’s own figure, and not one that moved another’s', () => {
    const log = buildCalibrationLog(
      [
        version(1, '2026-05-01', BASE),
        version(2, '2026-06-01', { ...BASE, AWA: { offset: 1 } }),
        version(3, '2026-07-01', { ...BASE, HDG: { offset: 3 } }),
      ],
      []
    )

    // The first Version states every figure, including `HDG`'s, so it is a boundary; the second
    // touched `AWA` alone and is not; the third re-typed the compass offset, which resets the
    // baseline a residual is measured against just as an autocompensation does.
    expect(calibrationEras(log, 'HDG').map((era) => era.from_date)).toEqual([
      null,
      '2026-05-01',
      '2026-07-01',
    ])
  })

  it('treats a Version and the Event that prompted it, on one date, as one boundary', () => {
    const log = buildCalibrationLog(
      [version(1, '2026-07-04', BASE)],
      [AUTOCOMPENSATION, event('2026-07-04', ['HDG'])]
    )
    const eras = calibrationEras(log, 'HDG')

    // One act on the instrument, not three Eras an hour apart — and the Era says what opened it.
    expect(eras).toHaveLength(2)
    expect(eras[1].opened_by).toHaveLength(3)
  })
})

describe('placing a date in an Era', () => {
  const eras = calibrationEras(buildCalibrationLog([], [AUTOCOMPENSATION]), 'HDG')

  it('puts the day of the act in the Era it opened, not the one it closed', () => {
    expect(eraOf(eras, '2026-07-04 19:00:00')?.from_date).toBe('2026-07-04')
    expect(eraOf(eras, '2026-07-03 19:00:00')?.from_date).toBe(null)
  })

  it('reads a naive stamp at the grain the Log is dated at', () => {
    // A Race Window is a time; a Calibration Event is a day. The time of day cannot decide which
    // side of a boundary a Race falls on, because nobody recorded the hour the compass was swung.
    expect(eraOf(eras, '2026-07-04 00:00:00')?.from_date).toBe('2026-07-04')
    expect(eraOf(eras, '2026-07-04 23:59:59')?.from_date).toBe('2026-07-04')
  })
})

describe('grouping Races by Era', () => {
  const eras = calibrationEras(buildCalibrationLog([], [AUTOCOMPENSATION]), 'HDG')
  const race = (date: string) => ({ date })

  it('keeps Era order and sorts nothing else', () => {
    const grouped = byEra(eras, [race('2026-08-01'), race('2026-06-01')], (item) => item.date)

    expect(grouped.map(({ era, items }) => [era.from_date, items.length])).toEqual([
      [null, 1],
      ['2026-07-04', 1],
    ])
  })

  it('drops an Era nobody sailed in rather than returning it empty', () => {
    // An Era with no Race is a stretch of the calendar, not a figure that could not be computed,
    // and the two must not arrive in the same list looking alike.
    const grouped = byEra(eras, [race('2026-08-01')], (item) => item.date)

    expect(grouped).toHaveLength(1)
    expect(grouped[0].era.from_date).toBe('2026-07-04')
  })
})
