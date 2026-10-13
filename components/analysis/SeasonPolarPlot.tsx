'use client'

/**
 * The **Polar Plot** on the Polar performance screen: patches inside a focus window (ADR 0040).
 *
 * ## The window owns the wind axis
 *
 * Without one, 45% of patches mixed two or more wind bands and held 73% of the scored time between
 * them: fast-for-5-knots and slow-for-15 land in one cell and cancel. So the picture is drawn over
 * a window of **uniform width** — a centre in whole knots across the certificate's range and a
 * width of 2, 4 or 6 — and every patch on it is then comparable with the columns ticked under the
 * slider. The rail has given up its `wind` chip on this screen for the same reason (ADR 0029's own
 * rule): a chip and a slider over one axis was the conflict that killed the prototype's first draft.
 *
 * **The window narrows the picture, not the match.** The Coverage Ledger and the two headline
 * figures above are over everything the rail matched, and this never feeds back into them.
 *
 * ## A patch is the tap target
 *
 * Never a sector: a wedge spans every speed at its angle, so it asks a question the picture has
 * already divided. The selected patch wears the accent halo, `←`/`→` walk the patches once the plot
 * has focus, and the card beside it (below it on a phone) states what the patch rests on.
 */

import { useMemo, useState, type ReactElement } from 'react'
import { NOTE_STYLE, PILL_STYLE } from '@/components/analysis/chrome'
import PolarPlot, { rimKnots, type PolarPlotReading } from '@/components/analysis/PolarPlot'
import PolarPlotLegend from '@/components/analysis/PolarPlotLegend'
import PolarPlotReadingToggle from '@/components/analysis/PolarPlotReadingToggle'
import { radius, spacing } from '@/lib/utils/design'
import { sumEfficiency } from '@/services/analysis/efficiency'
import { sharePercent } from '@/services/analysis/figures'
import { fillerAnchoredShare } from '@/services/analysis/polar-performance'
import {
  DEFAULT_FOCUS,
  FOCUS_WIDTHS,
  PATCH_SOG_KNOTS,
  PATCH_TWA_DEG,
  aggregateTargetKnots,
  clampCentre,
  familiesFor,
  focusRange,
  focusWindow,
  inFocus,
  plotMoments,
  plotPatches,
  timeNotDrawn,
  type FocusWidth,
  type PolarPlotPatch,
} from '@/services/analysis/polar-plot'
import { describeDuration } from '@/services/recordings/coverage'
import type { MatchableRow, PolarPayload } from '@/types'

export default function SeasonPolarPlot({
  rows,
  polars,
}: {
  /** Every row the rail matched. The window narrows what is drawn of these, never which these are. */
  rows: readonly MatchableRow[]
  /** Every Polar the archive's rows were scored against, by Version id. */
  polars: Readonly<Record<string, PolarPayload>>
}): ReactElement {
  const certificates = useMemo(() => Object.values(polars), [polars])
  const range = focusRange(certificates)

  const [centre, setCentre] = useState<number>(() =>
    range === null ? DEFAULT_FOCUS.centre : clampCentre(DEFAULT_FOCUS.centre, range)
  )
  const [width, setWidth] = useState<FocusWidth>(DEFAULT_FOCUS.width)
  const [reading, setReading] = useState<PolarPlotReading>('knots')
  const [selected, setSelected] = useState<string | null>(null)

  const focus = focusWindow(centre, width)
  const shown = useMemo(() => inFocus(rows, focusWindow(centre, width)), [rows, centre, width])
  const patches = useMemo(() => plotPatches(shown), [shown])
  const moments = useMemo(() => plotMoments(shown), [shown])
  const families = useMemo(() => familiesFor(shown, polars), [shown, polars])
  const drawn = useMemo(() => sumEfficiency(shown).elapsed_seconds, [shown])

  // Over everything the rail matched and every certificate, not over the window: a rim that moved
  // as the thumb did would redraw every ring and make two positions impossible to compare.
  const rim = useMemo(
    () =>
      rimKnots([
        ...plotMoments(rows).map((moment) => moment.sog + PATCH_SOG_KNOTS),
        ...certificates.flatMap((polar) => polar.boat_speed.flat()),
      ]),
    [rows, certificates]
  )

  if (range === null) {
    return (
      <Card>
        <p style={NOTE_STYLE}>
          No race in this archive records a Polar, so there is nothing to draw the sailing against.
        </p>
      </Card>
    )
  }

  const chosen = patches.find((patch) => patch.key === selected) ?? null
  const columns = [...new Set(certificates.flatMap((polar) => polar.tws_axis))].sort((a, b) => a - b)

  function step(by: -1 | 1): void {
    if (patches.length === 0) return
    const index = patches.findIndex((patch) => patch.key === selected)
    // From nothing, → opens on the first patch and ← on the last.
    const from = index === -1 ? (by === 1 ? -1 : 0) : index
    setSelected(patches[(from + by + patches.length) % patches.length].key)
  }

  return (
    <Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing(3) }}>
        <PolarPlotReadingToggle reading={reading} onReading={setReading} />

        <WindFocus
          range={range}
          columns={columns}
          centre={centre}
          onCentre={setCentre}
          width={width}
          onWidth={setWidth}
          drawnSeconds={drawn}
        />

        {/* The picture and the patch it was asked about, side by side once there is room: the
            card is what a sailor reads *while* looking at the patches, not a scroll below them. */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start">
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing(2) }}>
            <PolarPlot
              reading={reading}
              rim={rim}
              families={families}
              patches={patches}
              moments={moments}
              selectedPatch={selected}
              onPatch={setSelected}
              onStep={step}
              label={`The boat's speed at each wind angle against its certificate, over ${describeDuration(drawn)} of sailing in ${focus.low}–${focus.high} knots of wind. Tap a patch to read it.`}
            />
            <PolarPlotLegend form="patches" undrawn={timeNotDrawn(shown)} />
          </div>

          {drawn === 0 ? (
            <p style={NOTE_STYLE}>Nothing in this window could be scored against the Polar.</p>
          ) : (
            chosen !== null && <PatchCard patch={chosen} onClear={() => setSelected(null)} />
          )}
        </div>
      </div>
    </Card>
  )
}

/** The card the plot sits in: at 390px it is the screen, at desktop it is one object. */
function Card({ children }: { children: ReactElement }): ReactElement {
  return (
    <section
      data-testid="polar-plot-card"
      style={{
        padding: spacing(3),
        background: 'var(--surface-raised)',
        border: '1px solid var(--surface-border)',
        borderRadius: radius('md'),
      }}
    >
      {children}
    </section>
  )
}

/**
 * The window: a centre in whole knots and a width the sailor picks.
 *
 * The certificate's columns are ticked under the slider at their real positions and lit where
 * they fall inside the window, because those are what the patches are about to be compared with.
 */
function WindFocus({
  range,
  columns,
  centre,
  onCentre,
  width,
  onWidth,
  drawnSeconds,
}: {
  range: { from: number; to: number }
  columns: readonly number[]
  centre: number
  onCentre: (next: number) => void
  width: FocusWidth
  onWidth: (next: FocusWidth) => void
  drawnSeconds: number
}): ReactElement {
  const { low, high } = focusWindow(centre, width)
  const span = Math.max(1, range.to - range.from)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 420 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: spacing(2), flexWrap: 'wrap' }}>
        <strong
          data-testid="polar-plot-window"
          style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}
        >
          {low}–{high} kt
        </strong>
        <span style={{ ...NOTE_STYLE, fontFamily: 'var(--font-mono)' }}>
          {drawnSeconds === 0
            ? 'nothing sailed in this window'
            : `${describeDuration(drawnSeconds)} of sailing`}
        </span>
      </div>

      <input
        type="range"
        min={range.from}
        max={range.to}
        step={1}
        value={centre}
        data-testid="polar-plot-centre"
        aria-label="Centre of the wind-speed window, in knots"
        aria-valuetext={`${low} to ${high} knots`}
        onChange={(event) => onCentre(Number(event.target.value))}
        style={{ width: '100%', accentColor: 'var(--text-accent)' }}
      />

      <div aria-hidden style={{ position: 'relative', height: 12 }}>
        {columns
          .filter((tws) => tws >= range.from && tws <= range.to)
          .map((tws) => {
            const inside = tws >= low && tws < high
            return (
              <span
                key={tws}
                data-testid="polar-plot-column-tick"
                data-inside={inside ? '' : undefined}
                style={{
                  position: 'absolute',
                  left: `${((tws - range.from) / span) * 100}%`,
                  transform: 'translateX(-50%)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  color: inside ? 'var(--text-accent)' : 'var(--text-muted)',
                  fontWeight: inside ? 700 : 400,
                }}
              >
                {tws}
              </span>
            )
          })}
      </div>

      <div role="group" aria-label="Width of the wind window" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={NOTE_STYLE}>Window</span>
        {FOCUS_WIDTHS.map((each) => {
          const on = each === width
          return (
            <button
              key={each}
              type="button"
              data-testid={`polar-plot-width-${each}`}
              aria-pressed={on}
              onClick={() => onWidth(each)}
              style={{
                ...PILL_STYLE,
                padding: '5px 10px',
                borderColor: on ? 'var(--text-accent)' : 'var(--surface-border)',
                background: on ? 'var(--blue-muted)' : 'var(--surface-raised)',
                color: on ? 'var(--text-accent)' : 'var(--text-secondary)',
                fontWeight: on ? 700 : 500,
              }}
            >
              {each} kt
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * One patch, read out: where it is, how the sailing in it went, and what that rests on.
 *
 * The filler state is a chip and not a paragraph. The argument for how it is drawn is in the
 * legend's disclosure, once, for the whole picture.
 */
function PatchCard({ patch, onClear }: { patch: PolarPlotPatch; onClear: () => void }): ReactElement {
  const pct = patch.efficiency.polar_efficiency
  const target = aggregateTargetKnots(patch.efficiency)
  const filler = fillerAnchoredShare(patch.efficiency) ?? 0

  return (
    <div
      data-testid="polar-plot-patch-card"
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: spacing(3),
        border: '1px solid var(--surface-border)',
        borderLeft: '3px solid var(--text-accent)',
        borderRadius: radius('sm'),
        background: 'var(--surface-elevated)',
        maxWidth: 420,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing(2) }}>
        <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
          {patch.twa}–{patch.twa + PATCH_TWA_DEG}° at {patch.sog.toFixed(1)}–
          {(patch.sog + PATCH_SOG_KNOTS).toFixed(1)} kt
        </strong>
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear the selected patch"
          style={{
            border: 'none',
            background: 'none',
            color: 'var(--text-muted)',
            fontSize: 'var(--text-xs)',
            cursor: 'pointer',
            padding: 4,
          }}
        >
          clear
        </button>
      </div>

      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--text-primary)' }}>
        {pct === null ? 'no figure' : `${Math.round(pct * 100)}%`}
        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 400, color: 'var(--text-muted)' }}> of target</span>
      </span>

      <span style={{ ...NOTE_STYLE, fontFamily: 'var(--font-mono)' }}>
        {describeDuration(patch.efficiency.elapsed_seconds)} over {patch.races} race
        {patch.races === 1 ? '' : 's'}
        {target !== null && ` · target ${target.toFixed(2)} kt`}
      </span>

      {filler > 0 && (
        <span
          data-testid="polar-plot-patch-filler"
          style={{
            alignSelf: 'flex-start',
            padding: '1px 6px',
            borderRadius: radius('sm'),
            border: '1px dashed var(--state-warning)',
            fontSize: 'var(--text-xs)',
            color: 'var(--state-warning)',
          }}
        >
          {sharePercent(filler)} filler-anchored
        </span>
      )}
    </div>
  )
}
