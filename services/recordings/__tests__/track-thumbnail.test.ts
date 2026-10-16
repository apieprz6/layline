/**
 * The Dashboard's small picture of a race: one ink, and still honest about where the feed died.
 *
 * The claims ADR 0014 and ADR 0033 make of every map in Layline, held against the smallest one:
 * the track breaks into and out of a **Dropout**, the gap is bridged with its duration, and a race
 * with no fix at all is a null rather than an empty frame.
 */

import type { QualityAssessableRow } from '@/services/recordings/row-quality'
import { THUMBNAIL_BOX, trackThumbnail } from '@/services/recordings/track-thumbnail'

const LAT = 41.8528333
const LON = -87.5568333

/** One recorded row at `11:mm:ss`, moving unless told otherwise. */
function row(
  index: number,
  time: string,
  lat: string | null,
  lon: string | null,
  { cog = String(200 + index), sog = '5.1' }: { cog?: string | null; sog?: string | null } = {}
): QualityAssessableRow {
  return {
    row_index: index,
    row_time: `2026-08-22T${time}`,
    latitude: lat,
    longitude: lon,
    cog,
    sog,
    stw: '5.0',
    ctw: '201',
  }
}

/** A fix `step` thousandths of a degree north-east of the race circle. */
function at(step: number): [string, string] {
  return [(LAT + step / 1000).toFixed(7), (LON + step / 1000).toFixed(7)]
}

const WINDOW = { window_start: '2026-08-22T11:00:00', window_finish: '2026-08-22T12:00:00' }

describe('a race thumbnail', () => {
  it('draws a clean race as one unbroken line, inside the box', () => {
    const thumbnail = trackThumbnail(
      [row(1, '11:00:00', ...at(0)), row(2, '11:01:00', ...at(1)), row(3, '11:02:00', ...at(2))],
      WINDOW
    )

    expect(thumbnail?.width).toBe(THUMBNAIL_BOX.width)
    expect(thumbnail?.height).toBe(THUMBNAIL_BOX.height)
    expect(thumbnail?.runs).toHaveLength(1)
    expect(thumbnail?.runs[0].split(' ')).toHaveLength(3)
    expect(thumbnail?.bridges).toEqual([])
    expect(thumbnail?.rings).toEqual([])

    for (const point of thumbnail?.runs[0].split(' ') ?? []) {
      const [x, y] = point.split(',').map(Number)
      expect(x).toBeGreaterThanOrEqual(THUMBNAIL_BOX.pad - 0.01)
      expect(x).toBeLessThanOrEqual(THUMBNAIL_BOX.width - THUMBNAIL_BOX.pad + 0.01)
      expect(y).toBeGreaterThanOrEqual(THUMBNAIL_BOX.pad - 0.01)
      expect(y).toBeLessThanOrEqual(THUMBNAIL_BOX.height - THUMBNAIL_BOX.pad + 0.01)
    }
  })

  it('breaks at a Dropout, rings it, and bridges the gap with its duration', () => {
    // Rows 3–5 repeat row 2 verbatim, position and COG and SOG alike: qtVlm writing the last fix on
    // schedule after the feed died. The feed is back at row 6, seven minutes after row 2.
    const latched = { cog: '202', sog: '5.1' }
    const thumbnail = trackThumbnail(
      [
        row(1, '11:00:00', ...at(0)),
        row(2, '11:01:00', ...at(1), latched),
        row(3, '11:02:00', ...at(1), latched),
        row(4, '11:03:00', ...at(1), latched),
        row(5, '11:04:00', ...at(1), latched),
        row(6, '11:08:00', ...at(5)),
        row(7, '11:09:00', ...at(6)),
      ],
      WINDOW
    )

    // Two lines, not one: nothing draws water the boat may not have crossed.
    expect(thumbnail?.runs).toHaveLength(2)
    expect(thumbnail?.bridges).toHaveLength(1)
    // Row 2 moved to get there, so it is the last fix measured and the bridge starts on it.
    expect(thumbnail?.bridges[0].seconds).toBe(7 * 60)
    expect(thumbnail?.bridges[0].rows).toBe(3)
    expect(thumbnail?.rings).toHaveLength(3)
  })

  it('assesses the whole recording before clipping to the window', () => {
    // The Dropout starts before the gun. Clipped first, rows 3 and 4 would have nothing above them
    // to repeat and the race would open on a clean track of a boat that was not transmitting.
    const latched = { cog: '202', sog: '5.1' }
    const thumbnail = trackThumbnail(
      [
        row(1, '10:58:00', ...at(0), latched),
        row(2, '10:59:00', ...at(0), latched),
        row(3, '11:00:00', ...at(0), latched),
        row(4, '11:01:00', ...at(0), latched),
        row(5, '11:05:00', ...at(4)),
        row(6, '11:06:00', ...at(5)),
      ],
      WINDOW
    )

    expect(thumbnail?.rings).toHaveLength(2)
    expect(thumbnail?.runs).toHaveLength(1)
  })

  it('is null for a race whose GPS never spoke, rather than an empty frame', () => {
    expect(
      trackThumbnail([row(1, '11:00:00', null, null), row(2, '11:01:00', null, null)], WINDOW)
    ).toBeNull()
  })
})
