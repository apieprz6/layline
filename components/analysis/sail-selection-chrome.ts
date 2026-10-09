/**
 * What the **Sail Selection Screen**'s four layers print in a cell, and what colour they tint it.
 *
 * One module for both grids that draw them — the four thumbnails and the full-size one — because
 * the thumbnails are the switcher and a thumbnail that found a different shape from the grid it
 * enlarges into would be worse than no thumbnail at all.
 *
 * ## The number is the fact; the colour only finds the shape
 *
 * Every cell prints its number or glyph **whatever its colour** (ADR 0030). This is not belt and
 * braces: the night-vision theme collapses all eight `--sail-band-*` tokens to red tints and
 * flattens `--state-success` / `--state-warning` / `--state-danger` to reds, so on the exact screen
 * a sailor reads at night — and this archive holds a fourteen-hour overnight race — the print is
 * the only thing left that says which band a cell is in.
 *
 * Which is also why every colour here is a `color-mix()` of a token the app already owns rather
 * than a hex value: the night-vision override is on the token, so mixing keeps it working, and the
 * alpha is a rendering choice made here.
 *
 * ## Why each layer's ramp is the shape it is
 *
 * A **race count has an order**, so Coverage is a sequential single-hue ramp of `--text-accent`. A
 * **percent of target** has bands, so it takes the four state tokens at `<85 / 85–94 / 95–104 /
 * 105+` — and 105 and over gets its own band rather than folding into "on target", because it is
 * either genuinely fast or a calibration story and both are worth being able to find. A **verdict
 * has no order at all**, so Agreement is three state tokens and a muted neutral.
 */

import { radius } from '@/lib/utils/design'
import { UNKNOWN_SAIL_BAND } from '@/services/boat/crossoverSailBands'
import type { CellTotals, SailSelectionCell } from '@/services/analysis/sail-selection'
import type { CSSProperties } from 'react'

/** The four grids, in the order the thumbnails draw them. */
export const SAIL_SELECTION_LAYERS = [
  {
    id: 'chart',
    name: 'Chart',
    blurb: 'The sail the chart calls for. Never narrowed, never ghosted.',
  },
  { id: 'coverage', name: 'Coverage', blurb: 'Races that reached the cell.' },
  {
    id: 'target',
    name: '% target',
    blurb: 'Percent of Target Speed over the cell’s Countable rows.',
  },
  {
    id: 'agreement',
    name: 'Agreement',
    blurb: 'Whether the sail carried was the one the cell prints.',
  },
] as const

export type SailSelectionLayer = (typeof SAIL_SELECTION_LAYERS)[number]['id']

/** One cell with its figures already folded, so neither grid re-folds 338 cells to draw them. */
export interface CellView {
  cell: SailSelectionCell
  totals: CellTotals
}

/**
 * A cell with no figure, on a layer that has one to give.
 *
 * An en dash, and never `0` and never an interpolation: the absence of a target is a legitimate
 * answer with a reason (ADR 0012), and the reason is in the legend and in the cell's own breakdown.
 */
export const NO_FIGURE = '–'

/** The glyph each **Cell Agreement** verdict is read by. Printed in every theme. */
export const AGREEMENT_GLYPHS: Record<string, string> = {
  agrees: '=',
  differs: '≠',
  mixed: '±',
  'not-recorded': '?',
  'off-chart': '⊘',
  'no-rows': '',
}

/** What each verdict is called in words, where there is room for words. */
export const AGREEMENT_WORDS: Record<string, string> = {
  agrees: 'carried what the chart calls for',
  differs: 'carried something else',
  mixed: 'both, across this cell’s rows',
  'not-recorded': 'no row’s sail was written down',
  'off-chart': 'a sail the chart has no word for — never counted as disagreement',
  'no-rows': 'no rows here',
}

/** A token mixed down to a tint, so the night-vision override on the token still applies. */
function tint(token: string, percent: number): string {
  return `color-mix(in srgb, var(${token}) ${percent}%, transparent)`
}

/** Below target, near it, on it, over it — the four bands the legend names. */
export function targetToken(percent: number): string {
  if (percent < 85) return '--state-danger'
  if (percent < 95) return '--state-warning'
  if (percent < 105) return '--state-success'
  return '--text-accent'
}

export function targetTint(percent: number | null, alpha = 34): string {
  return percent === null ? 'var(--surface-divider)' : tint(targetToken(percent), alpha)
}

/** One hue, more of it with more races. The count is printed anyway. */
export function coverageTint(races: number): string {
  return races === 0 ? 'transparent' : tint('--text-accent', 13 + Math.round((Math.min(races, 9) / 9) * 34))
}

/**
 * The three state tokens and a muted neutral, because a verdict has no order.
 *
 * The two states that are *about the record* rather than about the water — **Not recorded** and
 * **Off-chart** — share the neutral and sit at a lower alpha, so neither reads as a judgement on
 * the crew. Off-chart is emphatically not disagreement (ADR 0023), and the glyph is what tells the
 * two apart.
 */
const AGREEMENT_TOKENS: Record<string, string | null> = {
  agrees: '--state-success',
  mixed: '--state-warning',
  differs: '--state-danger',
  'not-recorded': '--text-muted',
  'off-chart': '--text-muted',
  'no-rows': null,
}

export function agreementTint(agreement: string, alpha = 34): string {
  const token = AGREEMENT_TOKENS[agreement] ?? null
  if (token === null) return 'transparent'

  return tint(token, token === '--text-muted' ? 14 : alpha)
}

/** This cell's percent of target, rounded as the grid prints it, or null where it has none. */
export function cellPercent(view: CellView): number | null {
  const ratio = view.totals.efficiency.polar_efficiency
  return ratio === null ? null : Math.round(ratio * 100)
}

/**
 * Whether this cell keeps a **dotted ghost**: it held rows, and the current narrowing emptied it.
 *
 * The Chart layer never ghosts, because it never filtered. Blank plus a ghost rather than the
 * unfiltered value dimmed: showing a number the filter excludes is a lie with a legend, and on a
 * grid of 338 cells nobody consults the legend. Silently blanking loses the one thing a sailor
 * wants from a narrowing — what it cost — and moderate seas alone take this screen from 150 reached
 * cells to a fraction of that (ADR 0030).
 */
export function isGhost(view: CellView, layer: SailSelectionLayer): boolean {
  return layer !== 'chart' && view.totals.rows === 0 && view.cell.unfiltered_rows > 0
}

/**
 * Whether what this cell prints rests on a cell the Polar manufactured rather than measured.
 *
 * Shown in italic and never withheld: a row the boat actually sailed is real however weak the grid
 * cell it is compared against, so the doubt belongs *on* the figure (ADR 0036). There is no room
 * for a badge in 27 pixels, and a shape survives the night-vision theme where a colour does not.
 */
export function isFillerAnchored(view: CellView, layer: SailSelectionLayer): boolean {
  return layer === 'target' && view.totals.efficiency.filler_anchored_rows > 0
}

/** What the cell prints on this layer. The empty string is blank, and blank means blank. */
export function cellPrint(view: CellView, layer: SailSelectionLayer): string {
  if (layer === 'chart') {
    return view.cell.sail_number === null ? '' : String(view.cell.sail_number)
  }

  if (layer === 'target') {
    // A figure first, always: a computed figure is never suppressed on the strength of a claim
    // about the Polar's domain (ADR 0036). Then the structural dash — which prints whether or not
    // any Race reached the cell, because whether a Target Speed can exist there is a property of
    // the two artifacts' shapes and not of how much racing has been logged (ADR 0030).
    const percent = cellPercent(view)
    if (percent !== null) return String(percent)
    if (!view.cell.target_reachable) return NO_FIGURE

    return view.totals.rows === 0 ? '' : NO_FIGURE
  }

  if (view.totals.rows === 0) return ''
  if (layer === 'coverage') return String(view.totals.races)

  return AGREEMENT_GLYPHS[view.totals.agreement] ?? ''
}

/** The cell's fill on this layer. `transparent` where nothing was reached: empty reads as empty. */
export function cellTint(
  view: CellView,
  layer: SailSelectionLayer,
  bands: ReadonlyMap<number, string>
): string {
  if (layer === 'chart') {
    const band = view.cell.sail_number === null ? undefined : bands.get(view.cell.sail_number)
    return band ?? UNKNOWN_SAIL_BAND
  }

  if (layer === 'target') {
    const percent = cellPercent(view)
    if (percent !== null) return targetTint(percent)

    // A neutral and not the pale end of the band ramp: there is no figure here to be in a band,
    // and the dash printed over it is the fact.
    return !view.cell.target_reachable || view.totals.rows > 0
      ? 'var(--surface-divider)'
      : 'transparent'
  }

  if (view.totals.rows === 0) return 'transparent'
  if (layer === 'coverage') return coverageTint(view.totals.races)

  return agreementTint(view.totals.agreement)
}

/**
 * What a cell says when it is pointed at, in words.
 *
 * A grid of 338 glyphs is unreadable if every one has to be looked up, and this is also the cell
 * button's accessible name: a screen reader is given the sentence rather than the glyph.
 */
export function cellSentence(view: CellView, layer: SailSelectionLayer): string {
  const { cell, totals } = view
  const where = `${cell.twa}° at ${cell.tws} kt`
  const says = `chart says ${cell.recommendation?.definition.label ?? `sail ${cell.sail_number ?? '—'}`}`

  if (layer === 'chart') return `${where} — ${says}`

  if (totals.rows === 0) {
    const emptied =
      cell.unfiltered_rows > 0
        ? `, ${cell.unfiltered_rows} with the filter cleared`
        : ''
    return `${where} — ${says}, no sailing here under this filter${emptied}`
  }

  const coverage = `${totals.rows} rows from ${totals.races} ${totals.races === 1 ? 'race' : 'races'}`
  if (layer === 'coverage') return `${where} — ${says}, ${coverage}`

  if (layer === 'target') {
    const percent = cellPercent(view)
    const figure = percent === null ? 'no percent of target' : `${percent}% of target`
    return `${where} — ${says}, ${figure} over ${coverage}`
  }

  return `${where} — ${says}, ${AGREEMENT_WORDS[totals.agreement] ?? ''} over ${coverage}`
}

/** 40px of angle column, and thirteen wind speeds dividing what is left of a 390px screen. */
export const ANGLE_COLUMN = 40

export const GRID_TABLE_STYLE: CSSProperties = {
  width: '100%',
  // The fallback, not the target: at 390px the columns divide the width and nothing scrolls, and
  // below that the scroll keeps the cells readable rather than crushing them.
  minWidth: ANGLE_COLUMN + 13 * 22,
  tableLayout: 'fixed',
  borderCollapse: 'separate',
  borderSpacing: 0,
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-xs)',
  color: 'var(--text-primary)',
  whiteSpace: 'nowrap',
}

export const GRID_HEAD_STYLE: CSSProperties = {
  padding: '4px 0',
  textAlign: 'center',
  fontWeight: 'var(--weight-semibold)',
  color: 'var(--text-muted)',
  borderBottom: '1px solid var(--surface-border)',
  background: 'var(--surface-raised)',
}

export const GRID_CORNER_STYLE: CSSProperties = {
  ...GRID_HEAD_STYLE,
  width: ANGLE_COLUMN,
  minWidth: ANGLE_COLUMN,
  padding: '4px 2px',
}

export const GRID_ROW_HEAD_STYLE: CSSProperties = {
  width: ANGLE_COLUMN,
  minWidth: ANGLE_COLUMN,
  padding: '0 6px',
  textAlign: 'right',
  fontWeight: 'var(--weight-semibold)',
  color: 'var(--text-muted)',
  background: 'var(--surface-raised)',
}

/** The angle column stays put while the wind speeds scroll, or a cell names nothing. */
export const GRID_STICKY_STYLE: CSSProperties = {
  position: 'sticky',
  left: 0,
  zIndex: 1,
  borderRight: '1px solid var(--surface-border)',
}

/** A legend chip. Colour is never the only carrier, so this always sits beside words. */
export const SWATCH_STYLE: CSSProperties = {
  display: 'inline-block',
  width: 12,
  height: 12,
  marginRight: 4,
  verticalAlign: '-2px',
  border: '1px solid var(--surface-border)',
  borderRadius: radius('xs'),
}
