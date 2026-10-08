import { buildCalibrationLog, calibrationDiff, describeChange } from '../calibrationLog'
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
  payload: InstrumentCalibrationPayload,
  extra: Partial<InstrumentCalibrationVersion> = {}
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
    ...extra,
  }
}

/** The archive's one real event: the 2026-07-04 compass autocompensation. */
const AUTOCOMPENSATION: CalibrationEvent = {
  id: 'event-1',
  artifact_id: 'artifact-1',
  kind: 'instrument_calibration',
  occurred_on: '2026-07-04',
  type: 'autocompensation',
  channels: ['HDG'],
  note: 'Swung the compass off Navy Pier; deviation rebuilt.',
  created_by: 'admin-1',
  created_at: '2026-07-05T02:00:00Z',
  updated_at: '2026-07-05T02:00:00Z',
}

describe('the diff a Version mint is rendered as', () => {
  it('states every figure on the first Version, with nothing before it', () => {
    const changes = calibrationDiff(null, BASE)

    // Six figures: four offsets, two multipliers. `from: null` and not `from: 0` —
    // there was no previous figure, which is not a previous figure of zero.
    expect(changes).toHaveLength(6)
    expect(changes.every((c) => c.from === null)).toBe(true)
    expect(changes.filter((c) => c.field === 'multiplier').map((c) => c.channel)).toEqual([
      'AWS',
      'STW',
    ])
  })

  it('reports only what moved', () => {
    const changes = calibrationDiff(BASE, { ...BASE, HDG: { offset: 3 } })

    expect(changes).toEqual([{ channel: 'HDG', field: 'offset', from: 0, to: 3 }])
  })

  it('reports a multiplier and an offset on the same channel separately', () => {
    const changes = calibrationDiff(BASE, { ...BASE, STW: { multiplier: 1.05, offset: 0.2 } })

    expect(changes).toEqual([
      { channel: 'STW', field: 'multiplier', from: 1.02, to: 1.05 },
      { channel: 'STW', field: 'offset', from: 0, to: 0.2 },
    ])
  })

  it('is empty when a Version carried every figure unchanged', () => {
    // A Version snapshots all four channels, so minting one to record a note against
    // an unchanged set is possible and has no numeric diff to show.
    expect(calibrationDiff(BASE, { ...BASE })).toEqual([])
  })

  it('reports a multiplier appearing or vanishing rather than skipping it', () => {
    // Not a shape the form can produce — `AWA` has no multiplier field. It is a shape
    // a hand-edited row could hold, and silently omitting it from the diff would make
    // the Log disagree with the Version it is projecting.
    const gained = calibrationDiff(BASE, { ...BASE, AWA: { multiplier: 1.1, offset: 2 } })
    expect(gained).toEqual([{ channel: 'AWA', field: 'multiplier', from: null, to: 1.1 }])

    const lost = calibrationDiff({ ...BASE, AWA: { multiplier: 1.1, offset: 2 } }, BASE)
    expect(lost).toEqual([{ channel: 'AWA', field: 'multiplier', from: 1.1, to: null }])
  })
})

describe('the Calibration Log', () => {
  const v1 = version(1, '2026-05-02', BASE)
  const v2 = version(2, '2026-07-04', { ...BASE, HDG: { offset: 3 } }, {
    note: 'After the compass swing.',
  })

  it('merges Events and Version mints onto one timeline', () => {
    const log = buildCalibrationLog([v1, v2], [AUTOCOMPENSATION])

    expect(log).toHaveLength(3)
    expect(log.filter((e) => e.entry === 'version')).toHaveLength(2)
    expect(log.filter((e) => e.entry === 'event')).toHaveLength(1)
  })

  it('reads newest first, dated by when the thing happened', () => {
    const log = buildCalibrationLog([v1, v2], [AUTOCOMPENSATION])

    expect(log.map((e) => e.date)).toEqual(['2026-07-04', '2026-07-04', '2026-05-02'])
  })

  it('puts a Version mint above an Event of the same date', () => {
    // The Version is the consequence: the numbers went into the box because of the
    // swing, so on a newest-first timeline it reads above the act that prompted it.
    const log = buildCalibrationLog([v1, v2], [AUTOCOMPENSATION])

    expect(log[0].entry).toBe('version')
    expect(log[1].entry).toBe('event')
  })

  it('diffs each Version against the previous Version and not against the previous day', () => {
    // Mint order, not date order. A correction may give v2 an earlier effective date
    // than v1, and its diff is still against v1.
    const backdated = version(2, '2026-04-01', { ...BASE, HDG: { offset: 3 } })
    const log = buildCalibrationLog([v1, backdated], [])

    const second = log.find((e) => e.entry === 'version' && e.version.version_number === 2)
    expect(second?.entry === 'version' && second.changes).toEqual([
      { channel: 'HDG', field: 'offset', from: 0, to: 3 },
    ])
  })

  it('marks the first Version as first, whatever order the rows arrive in', () => {
    const log = buildCalibrationLog([v2, v1], [])

    const first = log.find((e) => e.entry === 'version' && e.version.version_number === 1)
    expect(first?.entry === 'version' && first.isFirst).toBe(true)

    const second = log.find((e) => e.entry === 'version' && e.version.version_number === 2)
    expect(second?.entry === 'version' && second.isFirst).toBe(false)
    expect(second?.entry === 'version' && second.changes).toHaveLength(1)
  })

  it('carries the Version itself, so a correction has the figures to open with', () => {
    const log = buildCalibrationLog([v1], [])

    expect(log[0].entry === 'version' && log[0].version).toBe(v1)
  })

  it('is empty on an artifact with nothing recorded against it', () => {
    expect(buildCalibrationLog([], [])).toEqual([])
  })

  it('holds an Event alone, with no Version anywhere', () => {
    // Reachable today: the archive's one event predates any transcribed figures.
    const log = buildCalibrationLog([], [AUTOCOMPENSATION])

    expect(log).toEqual([
      { entry: 'event', date: '2026-07-04', event: AUTOCOMPENSATION },
    ])
  })

  it('orders two Events on one date by when each was written down', () => {
    const later: CalibrationEvent = {
      ...AUTOCOMPENSATION,
      id: 'event-2',
      type: 'other',
      channels: ['STW'],
      note: 'Paddlewheel cleaned.',
      created_at: '2026-07-06T02:00:00Z',
    }

    const log = buildCalibrationLog([], [AUTOCOMPENSATION, later])

    expect(log.map((e) => e.entry === 'event' && e.event.id)).toEqual(['event-2', 'event-1'])
  })

  it('mutates neither list it was handed, because it stores nothing', () => {
    const versions = [v2, v1]
    const events = [AUTOCOMPENSATION]

    buildCalibrationLog(versions, events)

    expect(versions).toEqual([v2, v1])
    expect(events).toEqual([AUTOCOMPENSATION])
  })
})

describe('describeChange', () => {
  it('reads a first figure as set, not as a change from zero', () => {
    expect(describeChange({ channel: 'AWA', field: 'offset', from: null, to: 2 })).toBe(
      'AWA offset set to 2\u00b0'
    )
  })

  it('reads a moved figure as an arrow between the two', () => {
    expect(describeChange({ channel: 'AWA', field: 'offset', from: 2, to: 1 })).toBe(
      'AWA offset 2\u00b0 \u2192 1\u00b0'
    )
  })

  it('keeps a multiplier to two decimals on both sides, as the display shows it', () => {
    // 1.2 and 1.02 are different transcriptions, and trailing-zero trimming would
    // render them identically.
    expect(describeChange({ channel: 'AWS', field: 'multiplier', from: 1.2, to: 1.02 })).toBe(
      'AWS multiplier 1.20 \u2192 1.02'
    )
  })

  it('carries the channel\u2019s own unit on an offset and none on a multiplier', () => {
    expect(describeChange({ channel: 'STW', field: 'offset', from: 0, to: -0.2 })).toBe(
      'STW offset 0 kt \u2192 -0.2 kt'
    )
    expect(describeChange({ channel: 'STW', field: 'multiplier', from: null, to: 1 })).toBe(
      'STW multiplier set to 1.00'
    )
  })

  it('says a figure stopped being set rather than reading as unchanged', () => {
    expect(
      describeChange({ channel: 'AWS', field: 'multiplier', from: 1.02, to: null })
    ).toBe('AWS multiplier no longer set (was 1.02)')
  })

  it('invents no figure when there is one on neither side', () => {
    // calibrationDiff never produces this, but the type admits it and a rendered
    // `0` or `NaN` would be a number nobody programmed.
    expect(describeChange({ channel: 'HDG', field: 'multiplier', from: null, to: null })).toBe(
      'HDG multiplier not recorded'
    )
  })
})
