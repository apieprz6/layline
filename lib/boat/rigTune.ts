import { isCalendarDate } from '@/lib/utils/calendarDate'
import type {
  RigTuneBandDraft,
  RigTuneBandInput,
  RigTuneDraft,
  RigTuneDraftShrouds,
  RigTunePositionDraft,
  RigTuneProblem,
  RigTuneShrouds,
  RigTuneSideDraft,
  RigTuneVersionInput,
  RigTuneVersionRecord,
  ShroudPosition,
  ShroudSide,
  ShroudSideSetting,
} from '@/types'

/**
 * The Rig Tune's vocabulary, and the one place a typed draft becomes a Version.
 *
 * Pure and React-free: the form, the Server Action and the read all agree about what a
 * Shroud Position is called and what makes a table of Wind Bands writable, because they
 * ask the same module.
 */

/** Reading order, up the mast: cap shroud, lower, intermediate (ADR 0007). */
export const SHROUD_ORDER = ['V1', 'D1', 'D2'] as const satisfies readonly ShroudPosition[]

export const SHROUD_SIDES = ['port', 'starboard'] as const satisfies readonly ShroudSide[]

/** Port before starboard, and named the way they are called out on deck. */
export const SIDE_LABEL: Record<ShroudSide, string> = {
  port: 'Port',
  starboard: 'Stbd',
}

/**
 * The twelve figures of one band, built one at a time — the only place they are enumerated.
 *
 * Every caller (opening a Version for editing, moving the Base Tune flag) goes through here,
 * so a fourth Shroud Position would be a one-line change in `SHROUD_ORDER` rather than a
 * hunt for hand-written `V1: …, D1: …, D2: …` literals.
 */
export function buildDraftShrouds(
  make: (position: ShroudPosition, side: ShroudSide) => RigTuneSideDraft
): RigTuneDraftShrouds {
  return Object.fromEntries(
    SHROUD_ORDER.map((position) => [
      position,
      Object.fromEntries(
        SHROUD_SIDES.map((side) => [side, make(position, side)])
      ) as RigTunePositionDraft,
    ])
  ) as RigTuneDraftShrouds
}

/**
 * The recorded tune, opened for editing — or an empty table when nothing is recorded.
 *
 * The date and the change reason start blank: they describe the Version being made, and a
 * reason inherited from the last one would explain the wrong change. Every band keeps a
 * `seed` of what it was last measured as, which is what tells a band left alone from one
 * re-measured in this edit — the distinction the staleness rule turns on (ADR 0007).
 *
 * An unrecorded artifact opens as one empty band because there is no seed for a Rig Tune:
 * v1 is measured off this boat, and a guide's published figures stored as v1 would be
 * indistinguishable from that measurement.
 */
export function draftFromVersion(version: RigTuneVersionRecord | null): RigTuneDraft {
  if (version === null) {
    return {
      effective_from: '',
      change_reason: '',
      bands: [newBandDraft({ key: 'band-1', low_kt: '0', is_base: true })],
    }
  }

  return {
    effective_from: '',
    change_reason: '',
    bands: version.bands.map((band) => ({
      // The recorded row's id, which is stable for the length of the edit. It is never
      // written back: a Version mints new band rows (ADR 0011).
      key: band.id,
      label: band.label ?? '',
      low_kt: String(band.low_kt),
      high_kt: band.high_kt === null ? '' : String(band.high_kt),
      is_base: band.is_base,
      note: band.note ?? '',
      shrouds: draftShrouds(band.shrouds),
      seed: { shrouds: band.shrouds, gaps_stale: band.gaps_stale, was_base: band.is_base },
    })),
  }
}

/** An unmeasured band: every Gap blank, because a blank is not a zero. */
export function newBandDraft(over: Partial<RigTuneBandDraft> = {}): RigTuneBandDraft {
  return {
    key: `band-${Math.random().toString(36).slice(2, 10)}`,
    label: '',
    low_kt: '',
    high_kt: '',
    is_base: false,
    note: '',
    shrouds: buildDraftShrouds(() => ({ gap_mm: '', turns_from_base: '0' })),
    seed: null,
    ...over,
  }
}

/** A recorded band's figures, back in the fields they are typed in. */
function draftShrouds(shrouds: RigTuneShrouds): RigTuneDraftShrouds {
  return buildDraftShrouds((position, side) => ({
    gap_mm: String(shrouds[position][side].gap_mm),
    turns_from_base: String(shrouds[position][side].turns_from_base),
  }))
}

/**
 * The wind speeds a band covers, as a sailor reads them.
 *
 * The open top band is words rather than a dangling dash or an infinity sign: it runs to
 * whatever the day brings, and an edge drawn as missing would read as an unrecorded value.
 */
export function formatBandRange(lowKt: number, highKt: number | null): string {
  if (highKt === null) return `${lowKt} kt and up`
  return `${lowKt}–${highKt} kt`
}

/**
 * **Turns From Base** at the resolution it is recorded in: half turns, signed.
 *
 * A half is drawn as a half, because the figure is read off a turnbuckle rather than off a
 * calculator, and the sign is kept — slacker than the base is a setting, not an error.
 */
export function formatTurns(turns: number): string {
  if (turns === 0) return '0'

  // A figure off the half-turn grid is shown as it stands. Nothing in the app writes one —
  // the validator refuses it — but `rig_tune_bands` carries no CHECK on the resolution, and
  // drawing 1.25 as "+1" would reduce a recorded measurement to a rounder one.
  const magnitude = isHalfTurn(turns) ? halfTurns(Math.abs(turns)) : String(Math.abs(turns))

  // A real minus sign, not a hyphen: at --text-sm a hyphen beside a digit reads as a dash
  // between two figures.
  return `${turns < 0 ? '−' : '+'}${magnitude}`
}

/** A positive figure on the half-turn grid, drawn the way a turnbuckle is counted. */
function halfTurns(magnitude: number): string {
  const whole = Math.trunc(magnitude)
  const half = magnitude - whole === 0.5 ? '½' : ''

  return whole === 0 ? half : `${whole}${half}`
}

export function buildRigTuneVersionInput(
  draft: RigTuneDraft
): { ok: true; input: RigTuneVersionInput } | { ok: false; problems: RigTuneProblem[] } {
  const problems: RigTuneProblem[] = []

  const effectiveFrom = draft.effective_from.trim()
  if (effectiveFrom === '') {
    problems.push({ band_key: null, message: 'Say when this tune took effect.' })
  } else if (!isCalendarDate(effectiveFrom)) {
    problems.push({
      band_key: null,
      message: 'Give the date this tune took effect as YYYY-MM-DD.',
    })
  }

  const changeReason = draft.change_reason.trim()
  if (changeReason === '') {
    problems.push({ band_key: null, message: 'Say why this Version exists.' })
  }

  const read: ReadBand[] = []
  for (const band of draft.bands) {
    const edges = readEdges(band, problems)
    const shrouds = readShrouds(band, problems)
    if (edges === null || shrouds === null) continue

    // Turns are counted *from* this band, so the base standing anywhere but 0 would make
    // every other band's figure ambiguous (ADR 0007).
    if (band.is_base && !allTurnsZero(shrouds)) {
      problems.push({
        band_key: band.key,
        message: 'The Base Tune is where the Turns are counted from, so its own Turns are 0.',
      })
      continue
    }

    read.push({
      typed: band,
      band: {
        low_kt: edges.low_kt,
        high_kt: edges.high_kt,
        is_base: band.is_base,
        label: band.label.trim() === '' ? null : band.label.trim(),
        note: band.note.trim() === '' ? null : band.note.trim(),
        gaps_stale: false,
        shrouds,
      },
    })
  }

  const bands = withStaleGaps(read).sort((a, b) => a.low_kt - b.low_kt)

  // Only worth checking once every edge parsed: an unread band would report a phantom gap.
  if (problems.length === 0) checkBandTable(bands, problems)

  if (problems.length > 0) return { ok: false, problems }

  return {
    ok: true,
    input: {
      effective_from: effectiveFrom,
      note: changeReason,
      bands,
    },
  }
}

/** One band as it was typed, beside the band it reads as. */
interface ReadBand {
  typed: RigTuneBandDraft
  band: RigTuneBandInput
}

/**
 * Re-measuring the Base Tune makes the other bands' **Turnbuckle Gaps** stale, because those
 * millimetres were measured from a rig that no longer exists. Their **Turns** still hold —
 * they are counted off the base wherever the base now sits — and nothing is recomputed: no
 * thread pitch is recorded, so there is no honest arithmetic from one encoding to the other
 * (ADR 0007). A band re-measured in the same edit is fresh, a band added in this edit was
 * never measured against the old base, and the Base Tune is what the others are stale
 * *against*, so it is never stale itself.
 *
 * Re-measuring means the band that carries the flag now carried it before and its Gaps have
 * changed. Moving the flag to another band is not evidence of anything: it is a table being
 * re-organised, the millimetres are the same millimetres, and calling them stale would be a
 * claim nobody made.
 *
 * Returns fresh bands rather than editing the ones it was given, so nothing depends on the
 * order this runs in relative to the sort.
 */
function withStaleGaps(read: ReadBand[]): RigTuneBandInput[] {
  const base = read.find((entry) => entry.band.is_base)
  const baseReMeasured =
    base !== undefined &&
    base.typed.seed !== null &&
    base.typed.seed.was_base &&
    gapsDiffer(base.band.shrouds, base.typed.seed.shrouds)

  return read.map(({ typed, band }) => {
    if (band.is_base || typed.seed === null) return band
    // Re-measured in this same edit, so these millimetres describe the rig as it stands.
    if (gapsDiffer(band.shrouds, typed.seed.shrouds)) return band

    return { ...band, gaps_stale: baseReMeasured || typed.seed.gaps_stale }
  })
}

function allTurnsZero(shrouds: RigTuneShrouds): boolean {
  return SHROUD_ORDER.every((position) =>
    SHROUD_SIDES.every((side) => shrouds[position][side].turns_from_base === 0)
  )
}

/** Gaps only. A band whose Turns were adjusted was not re-measured with a caliper. */
function gapsDiffer(left: RigTuneShrouds, right: RigTuneShrouds): boolean {
  return SHROUD_ORDER.some((position) =>
    SHROUD_SIDES.some((side) => left[position][side].gap_mm !== right[position][side].gap_mm)
  )
}

/** Null when this band's edges cannot be read, so the table check has nothing to go on. */
function readEdges(
  band: RigTuneBandDraft,
  problems: RigTuneProblem[]
): { low_kt: number; high_kt: number | null } | null {
  const low = band.low_kt.trim()
  const high = band.high_kt.trim()

  if (low === '') {
    problems.push({ band_key: band.key, message: 'This band needs the wind speed it starts at.' })
    return null
  }

  const lowKt = Number(low)
  const highKt = high === '' ? null : Number(high)
  if (!isWindSpeed(lowKt) || (highKt !== null && !isWindSpeed(highKt))) {
    problems.push({ band_key: band.key, message: 'Band edges are wind speeds in knots.' })
    return null
  }

  if (highKt !== null && highKt <= lowKt) {
    problems.push({
      band_key: band.key,
      message: 'A band must end above the wind speed it starts at.',
    })
    return null
  }

  return { low_kt: lowKt, high_kt: highKt }
}

function isWindSpeed(knots: number): boolean {
  return Number.isFinite(knots) && knots >= 0
}

/**
 * The wind axis must answer every wind speed exactly once (ADR 0007): a gap would leave a
 * speed with no tune and an overlap would offer two. Checked here rather than in the
 * database, which can only see one row at a time.
 *
 * `bands` is already ascending by `low_kt`.
 */
function checkBandTable(bands: RigTuneBandInput[], problems: RigTuneProblem[]): void {
  if (bands.length === 0) {
    problems.push({ band_key: null, message: 'A Rig Tune needs at least one Wind Band.' })
    return
  }

  if (bands[0].low_kt !== 0) {
    problems.push({ band_key: null, message: 'The first band must start at 0 kt.' })
  }

  // The Base Tune is what every Turns figure is counted from, so a table without one means
  // nothing and a table with two means two different things (ADR 0007).
  const base = bands.filter((b) => b.is_base)
  if (base.length === 0) {
    problems.push({
      band_key: null,
      message: 'Mark the band the Turns are counted from as the Base Tune.',
    })
  } else if (base.length > 1) {
    problems.push({ band_key: null, message: 'Only one band is the Base Tune.' })
  }

  const open = bands.filter((b) => b.high_kt === null)
  if (open.length === 0) {
    problems.push({
      band_key: null,
      message: 'The top band must run open-ended, with no upper limit.',
    })
  } else if (open.length > 1 || open[0] !== bands[bands.length - 1]) {
    problems.push({ band_key: null, message: 'Only the top band runs open-ended.' })
  }

  for (let i = 1; i < bands.length; i += 1) {
    const below = bands[i - 1]
    const above = bands[i]
    if (below.high_kt === null) continue

    if (below.high_kt < above.low_kt) {
      problems.push({
        band_key: null,
        message: `No band covers ${below.high_kt} to ${above.low_kt} kt.`,
      })
    } else if (below.high_kt > above.low_kt) {
      problems.push({
        band_key: null,
        message: `Two bands cover ${above.low_kt} to ${below.high_kt} kt.`,
      })
    }
  }
}

/** Null when any of the twelve figures is missing: a band is written whole or not at all. */
function readShrouds(band: RigTuneBandDraft, problems: RigTuneProblem[]): RigTuneShrouds | null {
  const before = problems.length
  const read: Partial<RigTuneShrouds> = {}

  for (const position of SHROUD_ORDER) {
    read[position] = {
      port: readSide(band, position, 'port', problems),
      starboard: readSide(band, position, 'starboard', problems),
    }
  }

  if (problems.length > before) return null
  return read as RigTuneShrouds
}

/**
 * Turns are counted in half turns off the Base Tune, the finest a turnbuckle is read to at
 * the dock, and they run negative: below the base is slacker, not an error (ADR 0007).
 */
function isHalfTurn(turns: number): boolean {
  return Number.isFinite(turns) && Number.isInteger(turns * 2)
}

function readSide(
  band: RigTuneBandDraft,
  position: ShroudPosition,
  side: ShroudSide,
  problems: RigTuneProblem[]
): ShroudSideSetting {
  const typed = band.shrouds[position][side]
  const where = `${position} ${side}`

  const gap = typed.gap_mm.trim()
  if (gap === '') {
    problems.push({ band_key: band.key, message: `${where} needs a Turnbuckle Gap in mm.` })
  } else if (!(Number(gap) > 0) || !Number.isFinite(Number(gap))) {
    problems.push({
      band_key: band.key,
      message: `${where} Turnbuckle Gap must be a measurement in mm.`,
    })
  }

  const typedTurns = typed.turns_from_base.trim()
  const turns = Number(typedTurns)
  if (typedTurns === '') {
    // `Number('')` is 0, and 0 turns is a claim: set exactly as the Base Tune. An empty
    // field is an unmeasured band, so it is refused rather than read as that claim.
    problems.push({
      band_key: band.key,
      message: `${where} needs Turns From Base, in half turns.`,
    })
  } else if (!isHalfTurn(turns)) {
    problems.push({ band_key: band.key, message: `${where} Turns From Base goes in half turns.` })
  }

  return { gap_mm: Number(gap), turns_from_base: turns }
}
