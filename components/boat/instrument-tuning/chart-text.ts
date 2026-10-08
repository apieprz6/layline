/**
 * How the three Instrument Tuning charts write a figure down.
 *
 * Here rather than in each chart because the same `+12.7°` has to read identically on the compass
 * strip, in its readout, and on the card that opens it — three spellings of one figure are three
 * figures to a sailor glancing between them.
 *
 * Pure, and deliberately not `'use client'`: the cards a later ticket builds are Server Components
 * and print the same figures.
 */

/**
 * A signed figure with its sign always drawn, using a true minus rather than a hyphen.
 *
 * The sign is the reading. `3.3°` and `+3.3°` are the same number but only the second says the
 * compass reads *high*, and a deviation with no sign is a value nobody can act on.
 */
export function signed(value: number, unit: string, places = 1): string {
  return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(places)}${unit}`
}

/** `+12.7°`. */
export function signedDegrees(value: number, places = 1): string {
  return signed(value, '°', places)
}

/** `+0.45 kt` — two places, because the knot gaps this archive measures live in hundredths. */
export function signedKnots(value: number, places = 2): string {
  return signed(value, ' kt', places)
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

/**
 * `2026-07-04` or `2026-07-04 18:25:00` as `4 Jul`.
 *
 * Sliced and indexed rather than parsed into a `Date`. Every stamp in a Recording and every date in
 * the Calibration Log is in the boat's own frame with no offset on it, so handing one to `Date`
 * would have the runtime apply the *reader's* timezone and move a race across midnight.
 */
export function shortDate(date: string): string {
  const [year, month, day] = date.slice(0, 10).split('-')
  if (year === undefined || month === undefined || day === undefined) return date

  const name = MONTHS[Number(month) - 1]
  return name === undefined ? date : `${Number(day)} ${name}`
}

/**
 * What to call a **Calibration Era** on a chip or in a sentence.
 *
 * The opening Era is "the whole archive" and not "before nothing": until somebody records an act on
 * the channel there is exactly one Era, which is the state this screen ships in (ADR 0027), and
 * naming it after a boundary that does not exist would imply one.
 */
export function eraLabel(era: { from_date: string | null }): string {
  return era.from_date === null ? 'the whole archive' : `since ${shortDate(era.from_date)}`
}

/** A Race's name as a chart prints it, keyed by `race_id`. Built by whatever read the Races. */
export type RaceLabels = Readonly<Record<string, string>>

/**
 * What to call a Race.
 *
 * The date is the fallback rather than the format, because a sailor knows the Verve Cup by its
 * name. A Race the labels do not carry still gets named — by the day it was sailed, which the
 * figure itself carries — instead of printing an id nobody has ever seen.
 */
export function raceLabel(labels: RaceLabels, race_id: string, sailed_at: string): string {
  return labels[race_id] ?? shortDate(sailed_at)
}

/**
 * The label for every Race the archive holds.
 *
 * An untitled Race is named by its day alone and nothing is generated for it. "Race on 4 Sep" would
 * be Layline writing **Testimony** the sailor withheld, which the archive list already refuses to
 * do (ADR 0010).
 */
export function raceLabelsFrom(
  races: readonly { race_id: string; title: string | null; window_start: string }[]
): RaceLabels {
  return Object.fromEntries(
    races.map((race) => [
      race.race_id,
      race.title === null ? shortDate(race.window_start) : `${shortDate(race.window_start)} · ${race.title}`,
    ])
  )
}

const COMPASS_POINTS = [
  'N',
  'NNE',
  'NE',
  'ENE',
  'E',
  'ESE',
  'SE',
  'SSE',
  'S',
  'SSW',
  'SW',
  'WSW',
  'W',
  'WNW',
  'NW',
  'NNW',
]

/**
 * The nearest of the sixteen points to a heading: `15°` reads `NNE`.
 *
 * A heading bin is named as well as numbered because "the compass reads 12.7° high heading NNE" is
 * a sentence a sailor can check against the boat, and "heading bin 1" is not.
 */
export function compassPoint(headingDeg: number): string {
  return COMPASS_POINTS[Math.round(headingDeg / 22.5) % 16]
}

/** `3 rows` / `1 row`, so a count never reads as a plural of one. */
export function rows(count: number): string {
  return `${count} row${count === 1 ? '' : 's'}`
}

/** `3 Races` / `1 Race`. Capitalised, because a **Race** is one of the domain's own words. */
export function races(count: number): string {
  return `${count} Race${count === 1 ? '' : 's'}`
}

/** `3 Tack Pairs` / `1 Tack Pair` / `no Tack Pair`. */
export function tackPairs(count: number): string {
  return count === 0 ? 'no Tack Pair' : `${count} Tack Pair${count === 1 ? '' : 's'}`
}
