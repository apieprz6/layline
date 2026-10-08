/**
 * **Calibration Eras**, as the rules that cut them.
 *
 * Every figure the Instrument Tuning screen reports belongs to exactly one Era, so a boundary in
 * the wrong place is two instrument configurations averaged together — and a boundary that should
 * be there and isn't is the same thing, silently.
 */

import { buildCalibrationLog } from '@/lib/boat/calibrationLog'
import { byEra, calibrationEras, eraOf, withinEra } from '@/services/analysis/calibration-eras'
import type {
  CalibrationEra,
  CalibrationEvent,
  CalibrationLogEntry,
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
    // Not zero Eras and not an absent answer: a season nobody wrote a calibration down for is
    // still a season under some configuration, and every figure in it belongs to that one. This
    // is the state the Instrument Tuning screen ships in, so the whole shape is pinned — the key
    // included, since a chart keys a series on it.
    expect(calibrationEras([], 'HDG')).toEqual([
      { key: 'HDG:opening', channel: 'HDG', from_date: null, until_date: null, opened_by: [] },
    ])
  })

  it('opens an Era on each recorded act, and keeps the stretch before the first one', () => {
    const eras = calibrationEras(buildCalibrationLog([], [AUTOCOMPENSATION]), 'HDG')

    expect(eras.map((era) => [era.from_date, era.until_date])).toEqual([
      [null, '2026-07-04'],
      ['2026-07-04', null],
    ])
    // The Era says what opened it, in full, so a chart can mark the act and name it.
    expect(eras[1].opened_by).toEqual([
      { entry: 'event', date: '2026-07-04', event: AUTOCOMPENSATION },
    ])
  })

  it('counts the first Version as a boundary, leaving the unrecorded stretch its own Era', () => {
    // Before it, the figures in the box were whatever they were and nobody wrote them down. A
    // Race sailed then is not in the same Era as one sailed after.
    const eras = calibrationEras(buildCalibrationLog([version(1, '2026-05-02', BASE)], []), 'STW')

    expect(eras[0]).toEqual({
      key: 'STW:opening',
      channel: 'STW',
      from_date: null,
      until_date: '2026-05-02',
      opened_by: [],
    })
    expect(eras[1].opened_by).toHaveLength(1)
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
    expect(calibrationEras(log, 'HDG').map((era) => [era.from_date, era.until_date])).toEqual([
      [null, '2026-05-01'],
      ['2026-05-01', '2026-07-01'],
      ['2026-07-01', null],
    ])
  })

  it('treats a Version and the Event that prompted it, on one date, as one boundary', () => {
    const log = buildCalibrationLog(
      [version(1, '2026-07-04', BASE)],
      [AUTOCOMPENSATION, event('2026-07-04', ['HDG'])]
    )
    const eras = calibrationEras(log, 'HDG')

    // One act on the instrument, not three Eras an hour apart — and the Era says what opened it,
    // in the Log's own order, which puts the Version above the Events of its date.
    expect(eras).toHaveLength(2)
    expect(eras[1].opened_by.map((entry) => entry.entry)).toEqual(['version', 'event', 'event'])
  })

  it('bounds every Era with a day, whatever grain the entry it read was dated at', () => {
    // The Log dates entries at a day today (`occurred_on`, `effective_from`), so this is the
    // normalisation holding rather than a case the UI can produce. It is pinned because the
    // predicate below rests on it: comparing a Race's wall-clock stamp as text against a bound
    // gives the same answer as comparing the days *only* while the bound is a bare `YYYY-MM-DD`.
    // A bound that kept an entry's clock time would put a Race sailed that morning in the Era
    // before the act, which is the configuration it was not sailed under.
    const timed: CalibrationLogEntry[] = [
      { entry: 'event', date: '2026-08-01 14:30:00', event: event('2026-08-01', ['STW']) },
    ]
    const eras = calibrationEras(timed, 'STW')

    expect(eras.map((era) => [era.from_date, era.until_date])).toEqual([
      [null, '2026-08-01'],
      ['2026-08-01', null],
    ])
    expect(withinEra('2026-08-01 09:00:00', eras[1])).toBe(true)
  })
})

describe('placing a date in an Era, which is one predicate', () => {
  /** Three Eras: the unrecorded stretch, the paddlewheel as first recorded, and as rescaled. */
  const eras = calibrationEras(
    buildCalibrationLog(
      [
        version(1, '2026-05-02', BASE),
        version(2, '2026-08-01', { ...BASE, STW: { multiplier: 1.04, offset: 0 } }),
      ],
      []
    ),
    'STW'
  )

  /**
   * Every probe worth asking, with the Era index each belongs in: either side of both boundaries,
   * both boundary days themselves, each at both ends of its day, and one wall clock written with
   * a space and with a `T`, which the Era reads the same because the day is sliced off the text.
   *
   * No probe carries a UTC offset. A stamp that did would be read at the day its text starts with
   * and not converted to the **Recording**'s own frame, which is why nothing passes one.
   */
  const probes: [string, number][] = [
    ['2026-05-01', 0],
    ['2026-05-01 23:59:59', 0],
    ['2026-05-02', 1],
    ['2026-05-02 00:00:00', 1],
    ['2026-07-31 23:59:59', 1],
    ['2026-08-01', 2],
    ['2026-08-01 00:00:00', 2],
    ['2026-08-01 10:00:00', 2],
    ['2026-08-01T10:00:00', 2],
    ['2026-08-01 23:59:59', 2],
    ['2026-09-30 18:00:00', 2],
  ]

  /**
   * The containment test LAY-156 shipped, written out here as the reference the survivor is
   * measured against: the whole stamp compared as text, rather than sliced to a day first.
   *
   * In the suite and not in the module because nothing should call it — it is the predicate that
   * was *replaced*. The two were assumed equivalent when one replaced the other, and the test
   * below is where that stops being an assumption. They agree only because every bound this
   * builder emits is a bare `YYYY-MM-DD`; drop that and this is the test that notices.
   */
  function asWholeStampText(date: string, era: CalibrationEra): boolean {
    if (era.from_date !== null && date < era.from_date) return false
    return era.until_date === null || date < era.until_date
  }

  it('puts a boundary day in the Era it opened, not the one it closed', () => {
    for (const [date, index] of probes) {
      expect([date, eras.findIndex((era) => withinEra(date, era))]).toEqual([date, index])
    }
  })

  it('places every date in exactly one Era, so no figure can be pooled across a boundary', () => {
    for (const [date] of probes) {
      expect(eras.filter((era) => withinEra(date, era))).toHaveLength(1)
    }
  })

  it('agrees with the whole-stamp text compare it replaced, Era by Era and probe by probe', () => {
    for (const [date] of probes) {
      for (const era of eras) {
        expect([date, era.key, withinEra(date, era)]).toEqual([
          date,
          era.key,
          asWholeStampText(date, era),
        ])
      }
    }
  })

  it('agrees only because no bound carries a clock time, and none of these does', () => {
    // Where the two rules part company, which is the thing the test above would otherwise be
    // asserting by coincidence. Against a bound of `2026-08-01 14:30:00`, a Race at 23:00 that
    // day is *after* the boundary read as whole text and *before* it read at the day — two
    // answers about which instrument configuration the Race was sailed under.
    const stamped: CalibrationEra = {
      key: 'STW:stamped',
      channel: 'STW',
      from_date: '2026-08-01 14:30:00',
      until_date: null,
      opened_by: [],
    }

    expect(asWholeStampText('2026-08-01 23:00:00', stamped)).toBe(true)
    expect(withinEra('2026-08-01 23:00:00', stamped)).toBe(false)

    // So the equivalence is a consequence of `calibrationEras` cutting on days, and holds only
    // for as long as it does. Every bound it emits is a bare `YYYY-MM-DD`, or absent.
    const bounds = eras.flatMap((era) => [era.from_date, era.until_date])

    expect(bounds.every((bound) => bound === null || /^\d{4}-\d{2}-\d{2}$/.test(bound))).toBe(true)
  })

  it('is the rule `eraOf` reports, so an Era cannot answer one caller and not the other', () => {
    for (const [date, index] of probes) {
      expect(eraOf(eras, date)).toBe(eras[index])
    }
  })

  it('reads a naive stamp at the grain the Log is dated at', () => {
    // A Race Window is a time; a Calibration Event is a day. The time of day cannot decide which
    // side of a boundary a Race falls on, because nobody recorded the hour the compass was swung.
    const swung = calibrationEras(buildCalibrationLog([], [AUTOCOMPENSATION]), 'HDG')

    expect(eraOf(swung, '2026-07-04 00:00:00')?.from_date).toBe('2026-07-04')
    expect(eraOf(swung, '2026-07-04 23:59:59')?.from_date).toBe('2026-07-04')
    expect(eraOf(swung, '2026-07-03 23:59:59')?.from_date).toBe(null)
  })

  it('is null for a date the Eras given do not cover', () => {
    // Cannot happen for Eras from `calibrationEras` — they cover the whole timeline between them
    // — so it is asked of a hand-cut Era, which is what a caller slicing a range would hold.
    expect(eraOf([eras[1]], '2026-09-01')).toBeNull()
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
