/**
 * The join every Instrument Tuning check reads its rows through, and the speed gate they share.
 */

import { analysisRows, analysisRowsWithin } from '@/services/analysis/countable'
import {
  SOG_MIN_KNOTS,
  aboveSpeedGate,
  analysisReadings,
  channelValue,
} from '@/services/analysis/readings'
import { detectManeuvers } from '@/services/analysis/maneuvers'
import { parseQtvlmRecording } from '@/services/recordings/qtvlm'
import { LOW_SPEED_SOG_KNOTS, assessRowQuality } from '@/services/recordings/row-quality'
import type { Transcription } from '@/types'

const HEADER = 'Date;Longitude;Latitude;COG;SOG;TWA;STW;CTW;AWA (calc)'

/** Four rows at four fixes, a minute apart, sailing on starboard at six knots. */
function recording(): Transcription {
  const lines = [0, 1, 2, 3].map((index) =>
    [
      `06/03/2026 19:0${index}:00`,
      `-87.6123${7000 + index}`,
      `41.8845${9000 + index}`,
      `${210 + index}.0`,
      '6.0',
      '42.0',
      '5.8',
      `${214 + index}.0`,
      '38.0',
    ].join(';')
  )
  const outcome = parseQtvlmRecording([HEADER, ...lines, ''].join('\n'))
  if (!outcome.ok) throw new Error(`expected a Transcription, got ${outcome.reason}`)
  return outcome.transcription
}

function readings() {
  const { rows } = recording()
  const quality = assessRowQuality(rows)
  return analysisReadings(rows, analysisRows(quality, detectManeuvers(rows, quality)))
}

describe('joining a row’s channels to its Countable verdict', () => {
  it('keeps both halves on one row', () => {
    const [first] = readings()

    expect(first).toMatchObject({
      row_index: 1,
      countable: true,
      ctw: '214.0',
      awa_calc: '38.0',
    })
    expect(first.quality.frozen).toBe(false)
  })

  it('refuses two row lists that are not the same rows in the same order', () => {
    const { rows } = recording()
    const quality = assessRowQuality(rows)
    const verdicts = analysisRows(quality, detectManeuvers(rows, quality))

    // A misaligned join would hand one row's heading to its neighbour's verdict, which is a wrong
    // figure rather than a missing one.
    expect(() => analysisReadings(rows.slice(1), verdicts)).toThrow(/not the same rows/)
  })

  it('survives being clipped to a Race Window with its channels attached', () => {
    const inWindow = analysisRowsWithin(readings(), {
      window_start: '2026-06-03 19:01:00',
      window_finish: '2026-06-03 19:02:00',
    })

    expect(inWindow.map((row) => row.ctw)).toEqual(['215.0', '216.0'])
  })
})

describe('the analysis speed gate', () => {
  it('is stricter than Low-Speed, and composes with it rather than replacing it', () => {
    // 3.4 kt is a sailing boat by Row Quality's reckoning and still too slow for a heading reading
    // to say anything about the compass. Both gates are applied, in that order, because this
    // relationship is a fact about today's constants and not a rule.
    expect(SOG_MIN_KNOTS).toBeGreaterThan(LOW_SPEED_SOG_KNOTS)
    expect(aboveSpeedGate({ sog: '3.4' })).toBe(false)
    expect(aboveSpeedGate({ sog: '3.5' })).toBe(true)
  })

  it('refuses a row with no speed at all rather than reading it as zero', () => {
    expect(aboveSpeedGate({ sog: null })).toBe(false)
    expect(aboveSpeedGate({ sog: '' })).toBe(false)
  })
})

describe('reading a channel’s text as a number', () => {
  it('keeps what the file wrote, including a trailing zero’s worth of precision', () => {
    expect(channelValue('214.0')).toBe(214)
    expect(channelValue('-0.5')).toBe(-0.5)
  })

  it('is null for anything that is not a number, rather than NaN', () => {
    // `NaN` is `typeof 'number'` and would pass straight through a field typed `number`.
    expect(channelValue(null)).toBe(null)
    expect(channelValue('')).toBe(null)
    expect(channelValue('n/a')).toBe(null)
  })
})
