'use client'

/**
 * The furniture all three Instrument Tuning charts are built out of.
 *
 * Shared because the three charts are one instrument to the sailor flipping between them: the same
 * segmented toggle, the same chip rail, the same readout panel in the same place. Three private
 * copies would drift, and a readout that moves by four pixels between two charts reads as two
 * screens.
 *
 * Two rules the charts inherit from here rather than each deciding:
 *
 * - **Hit-testing is the chart's, from the tap position.** A 10° heading bin at 390px is nine
 *   pixels wide and no finger lands on that, so `svgPoint` gives a chart the tap in its own
 *   coordinates and the chart decides what was meant (ADR 0034).
 * - **The readout is always present.** An absent selection is a *state* with something to say, so
 *   the panel holds its height whether anything is picked or not and the chart above it never
 *   jumps under the finger that just tapped it.
 */

import type { CSSProperties, KeyboardEvent, MouseEvent, ReactElement, ReactNode } from 'react'
import { spacing } from '@/lib/utils/design'
import type { CoverageStatement } from '@/types'

/**
 * The one viewBox every chart on this screen is drawn in.
 *
 * **One box, so there is one scale.** Each chart is laid out `width: 100%` inside the same column,
 * so its viewBox width alone decides how far its own units are magnified on the way to the screen.
 * Four different widths — 340 for the strip, 320 for the rose, 300 for the scatter — meant four
 * zoom levels: at 390px the scatter's contents came out 13% larger than the strip's, and a `7.5`
 * label was 7.1px on one chart and 8.6px on another. Nothing in the data justified either, and
 * three charts a sailor flips between have to read as one instrument.
 *
 * The height is shared too, which costs the two linear charts some empty space and buys three
 * things: the page does not resize under the finger that just toggled Strip to Rose, a polar chart
 * stays a circle, and a degree of compass error is the same number of pixels as a degree of
 * apparent wind.
 *
 * Named for this screen rather than `CHART_WIDTH`, because `components/race-flow/chart-geometry.ts`
 * already exports a `CHART_WIDTH` of 360 and the two are not the same width — that one exists so a
 * track map and a channel chart draw the same second at the same pixel, which these three charts
 * have no reason to share. Two same-named constants with different values is a reader trap.
 */
export const TUNING_CHART_WIDTH = 340

/** Tall enough for a circle with its labels outside it, which is what sets the floor. */
export const TUNING_CHART_HEIGHT = 300

/** `0 0 340 300`, for every chart on this screen. */
export const TUNING_VIEW_BOX = `0 0 ${TUNING_CHART_WIDTH} ${TUNING_CHART_HEIGHT}`

/**
 * The type scale, in viewBox units — which, because every chart shares one viewBox, is also one
 * type scale in pixels.
 *
 * Four sizes and no others. Picking a number per label is how the old charts ended up with `7`,
 * `7.5`, `8`, `8.5` and `10` across five views of three measurements, none of the differences
 * meaning anything. At 390px these render at roughly 8.6, 7.6, 6.7 and 7.6 CSS pixels.
 */
export const CHART_FONT = {
  /** Cardinal points and axis names — what you read to orient yourself on the chart. */
  label: 9,
  /** A number on an axis. */
  tick: 8,
  /** A count that has to fit inside a 9-unit column, in the evidence row under a chart. */
  micro: 7,
  /** A note written on the plot itself: "reaching · not used", "1:1 · as configured". */
  note: 8,
} as const

/**
 * The layout the two linear charts share: the compass strip, and boat speed's gap by speed.
 *
 * Shared rather than chosen twice, for the reason `race-flow/chart-geometry.ts` shares its insets:
 * two charts with their own padding draw their baselines at two different heights, and the stack
 * stops reading as one screen. Both of these are a signed quantity against a zero line, over a
 * row of evenly-spaced columns, with a count per column beneath — so they are the same layout
 * twice and not two layouts.
 */
export const LINEAR = {
  /** Room on the left for the value labels on the zero-line axis. */
  axisLeft: 28,
  axisRight: 8,
  /** The zero line, which both charts read above and below. */
  zeroY: 112,
  /** Half the plot's height: how far above and below the zero line a series may be drawn. */
  halfHeight: 98,
  /** Where the column names sit — headings on one chart, boat speeds on the other. */
  columnLabelY: 236,
  /** The evidence row beneath the plot: how much each column rests on. */
  evidenceY: 250,
  evidenceHeight: 16,
} as const

/** The pixels one linear chart's columns span, and so what one column is worth. */
export const LINEAR_PLOT_WIDTH = TUNING_CHART_WIDTH - LINEAR.axisLeft - LINEAR.axisRight

/**
 * The tap position in the SVG's own viewBox coordinates, or null where it cannot be located.
 *
 * Through `getScreenCTM`, so it is correct at any rendered width — these charts are fixed-viewBox
 * and fluid-width, and arithmetic off `getBoundingClientRect` would be wrong at every width but
 * one.
 *
 * Null rather than a fallback position. jsdom implements neither `getScreenCTM` nor `DOMPoint` —
 * which is the honest reason Jest drives these charts by the keyboard and Playwright drives the
 * taps — and a stand-in origin would have the rose quietly pick 315° for every tap it could not
 * place. A chart that cannot locate a tap does nothing, which is the only answer that invents
 * nothing.
 */
export function svgPoint(event: MouseEvent<SVGSVGElement>): { x: number; y: number } | null {
  const svg = event.currentTarget
  if (typeof svg.getScreenCTM !== 'function' || typeof DOMPoint === 'undefined') return null

  const matrix = svg.getScreenCTM()
  if (!matrix) return null

  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
  return { x: point.x, y: point.y }
}

/**
 * Left or right from an arrow key, or null for any other key.
 *
 * Every chart here is a one-dimensional row of things to pick — a heading bin, a speed band — so
 * every chart wants the same two keys, and the keyboard is the only way to reach a nine-pixel bin
 * precisely. `preventDefault` so the arrow does not also scroll the sheet the chart sits in.
 */
export function arrowStep(event: KeyboardEvent): -1 | 1 | null {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return null
  event.preventDefault()
  return event.key === 'ArrowRight' ? 1 : -1
}

/**
 * A segmented control: two views of one measurement, or two ways of fitting one line.
 *
 * `radiogroup` rather than two buttons, because these are not two actions — they are one setting
 * with two values, and a screen reader should say which one is current. The selected option is
 * filled as well as labelled; colour alone would not survive the night-vision theme.
 */
export function Segmented<Key extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { key: Key; label: string }[]
  value: Key
  onChange: (key: Key) => void
  /** What the group is for, since the labels alone ("Strip", "Rose") do not say. */
  label: string
}): ReactElement {
  return (
    <div role="radiogroup" aria-label={label} style={SEGMENTED_STYLE}>
      {options.map((option) => {
        const on = option.key === value
        return (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(option.key)}
            style={{
              flex: '1 0 auto',
              border: 'none',
              borderRadius: 'var(--radius-full)',
              padding: '5px 9px',
              fontSize: 10.5,
              fontWeight: on ? 700 : 500,
              background: on ? 'var(--text-primary)' : 'transparent',
              color: on ? 'var(--text-inverse)' : 'var(--text-secondary)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export interface ChipOption {
  id: string
  label: string
  /**
   * Why this chip has nothing to draw, where it has nothing to draw.
   *
   * The chip is still offered and still pickable — ADR 0012's rule that absence is an answer. A
   * Race that produced no curve is drawn dashed, and picking it says what stopped it rather than
   * leaving the sailor to wonder whether they mis-tapped.
   */
  emptyReason?: string
}

/**
 * The level rail: which Era, or which Race, the chart is drawing.
 *
 * Scrolls sideways rather than wrapping. Thirteen Races wrapped to four lines push the chart off a
 * 390px screen, and the chart is the thing being read.
 */
export function Chips({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly ChipOption[]
  value: string
  onChange: (id: string) => void
  label: string
}): ReactElement {
  return (
    <div
      role="group"
      aria-label={label}
      style={{ display: 'flex', gap: 4, overflowX: 'auto', padding: '2px 0 6px' }}
    >
      {options.map((option) => {
        const on = option.id === value
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(option.id)}
            style={{
              flexShrink: 0,
              border: `1px ${option.emptyReason ? 'dashed' : 'solid'} var(--surface-border)`,
              borderRadius: 'var(--radius-full)',
              padding: '5px 10px',
              fontSize: 10.5,
              background: on ? 'var(--text-primary)' : 'transparent',
              color: on
                ? 'var(--text-inverse)'
                : option.emptyReason
                  ? 'var(--text-muted)'
                  : 'var(--text-secondary)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * The panel under a chart that says what is selected and what it rests on.
 *
 * `aria-live="polite"`, because on this screen the readout *is* the answer: a tap that changed a
 * nine-pixel highlight and nothing announced has told a screen reader nothing. `minHeight` holds
 * the layout still through a selection that says more or less than the last one.
 */
export function Readout({ children }: { children: ReactNode }): ReactElement {
  return (
    <div
      aria-live="polite"
      data-testid="chart-readout"
      style={{
        marginTop: spacing(2),
        background: 'var(--surface-elevated)',
        border: '1px solid var(--surface-border)',
        borderRadius: 'var(--radius-md)',
        padding: '8px 10px',
        minHeight: 72,
        fontSize: 11,
        lineHeight: 1.5,
        color: 'var(--text-secondary)',
      }}
    >
      {children}
    </div>
  )
}

/** The one figure a readout leads with. Mono, because it is a measurement and not prose. */
export function Big({ children, tone }: { children: ReactNode; tone?: string }): ReactElement {
  return (
    <div
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 15,
        color: tone ?? 'var(--text-primary)',
        lineHeight: 1.3,
      }}
    >
      {children}
    </div>
  )
}

/** What the chart is, and how to read it. Under the chart, above the caveat the sheet carries. */
export function Caption({ children }: { children: ReactNode }): ReactElement {
  return (
    <p
      style={{
        margin: `${spacing(2)} 0 0`,
        fontSize: 10.5,
        lineHeight: 1.55,
        color: 'var(--text-secondary)',
      }}
    >
      {children}
    </p>
  )
}

/**
 * The **coverage verdict**, as a word with its reason beside it.
 *
 * The word is printed and never carried by colour — the whole statement is one neutral tone, on
 * purpose, because `SOLID` is not good news about the instrument and nothing here should read as a
 * pass mark (ADR 0034).
 */
export function Coverage({ statement }: { statement: CoverageStatement }): ReactElement {
  return (
    <div
      data-testid="coverage-verdict"
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: spacing(2),
        flexWrap: 'wrap',
        fontSize: 10.5,
        color: 'var(--text-muted)',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.08em',
          color: 'var(--text-secondary)',
          border: '1px solid var(--surface-border)',
          borderRadius: 'var(--radius-sm)',
          padding: '2px 6px',
        }}
      >
        {statement.verdict}
      </span>
      <span>{statement.reason}</span>
    </div>
  )
}

/**
 * The hatch that means "nothing was measured here", matching `NotRecorded`'s diagonal.
 *
 * A pattern and not a pale fill, because a pale bar is still a bar and a sailor reads its height.
 * Nothing is ever drawn *across* a hatched bin — no line, no interpolation — which is the whole
 * point of having a mark for absence (ADR 0012).
 */
export function HatchDef({ id }: { id: string }): ReactElement {
  return (
    <defs>
      <pattern
        id={id}
        width="5"
        height="5"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <line
          x1="0"
          y1="0"
          x2="0"
          y2="5"
          stroke="var(--text-muted)"
          strokeWidth="1"
          opacity="0.35"
        />
      </pattern>
    </defs>
  )
}

/** A row of the readout: a label on the left, a mono figure hard right. */
export function DetailRow({
  name,
  figure,
  emphasis,
}: {
  name: ReactNode
  figure: ReactNode
  emphasis?: boolean
}): ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: spacing(2),
        fontWeight: emphasis ? 700 : 400,
      }}
    >
      <span style={{ minWidth: 0 }}>{name}</span>
      <span style={{ fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{figure}</span>
    </div>
  )
}

const SEGMENTED_STYLE: CSSProperties = {
  display: 'flex',
  border: '1px solid var(--surface-border)',
  borderRadius: 'var(--radius-full)',
  padding: 2,
  gap: 2,
  overflowX: 'auto',
}

/** Every interactive chart's own frame: focusable for the arrow keys, tappable for everything. */
export const CHART_SVG_STYLE: CSSProperties = {
  display: 'block',
  width: '100%',
  cursor: 'pointer',
  touchAction: 'manipulation',
}
