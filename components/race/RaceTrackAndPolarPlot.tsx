'use client'

/**
 * The **Race Track Heatmap** and the **Polar Plot**, side by side, sharing one selection and one
 * readout (ADR 0040).
 *
 * ## One row index, above both pictures
 *
 * Tap a dot and that stretch lights on the track; tap the track and the dot rings. Both are the
 * same action on the same state — a `row_index`, the one identity both pictures already have — so
 * there is nothing to keep in sync and no direction to it. The track's two pieces of state, which
 * overlay is painted and which row is selected, live here rather than in the map for that reason,
 * and the overlay chips with them: three things read each answer, and two copies would drift.
 *
 * It holds the index rather than the map's `TrackRowFacts` because the map has no facts for some
 * rows the Polar Plot draws (the first fix of a run has no stroke), and holding the facts would
 * make those rows unselectable from the plot or, worse, silently clear the selection.
 *
 * ## One readout, sticky, below both
 *
 * Opened by a tap and absent until then — a standing placeholder is instructions read once and
 * scrolled past forever. Sticky at the bottom at every width, because the two cards are 700–900px
 * tall and "both visible at once" only holds at the top of the page. When the tapped mark lands
 * under it, the page is nudged just far enough to show it, and only then.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react'
import { NOTE_STYLE } from '@/components/analysis/chrome'
import PolarPlot, { rimKnots, type PolarPlotReading } from '@/components/analysis/PolarPlot'
import PolarPlotLegend from '@/components/analysis/PolarPlotLegend'
import PolarPlotReadingToggle from '@/components/analysis/PolarPlotReadingToggle'
import { radius, spacing } from '@/lib/utils/design'
import { certificateFamily } from '@/services/analysis/polar-plot'
import { TRACK_OVERLAYS, TRACK_SCALES, isRatioOverlay } from '@/services/analysis/track-overlays'
import { describeDuration } from '@/services/recordings/coverage'
import type {
  PolarPlotTraceBin,
  RaceTrack,
  TrackOverlay,
  TrackRowFacts,
} from '@/types'

import SharedReadout from './SharedReadout'
import TrackHeatmapFrame from './TrackHeatmapFrame'
import TrackHeatmapLegend from './TrackHeatmapLegend'

/** What the map is, for a reader who cannot see it. */
const MAP_LABEL =
  'The race track, with each stretch coloured by the chosen measurement. Zoomable, pannable, and ' +
  'tap a stretch to read it.'

/** How far clear of the readout a tapped mark is kept, in CSS pixels. */
const CLEARANCE = 16

export default function RaceTrackAndPolarPlot({
  track,
  season,
}: {
  track: RaceTrack
  /** The whole archive as ten-degree sums, behind this Race. Null where it could not be read. */
  season: PolarPlotTraceBin[] | null
}): ReactElement {
  const { heatmap, scoring, plot } = track
  const hasPolar = scoring === 'polar'

  const [overlay, setOverlay] = useState<TrackOverlay>(
    // Percent of target is the opening claim where the race can make it; a race with no Polar
    // opens on what it does have, which is what the boat was doing.
    hasPolar ? 'target_speed' : 'sog'
  )
  const [selected, setSelected] = useState<number | null>(null)
  /** Which picture the tap came from, so the nudge keeps *that* mark in view. */
  const [tappedOn, setTappedOn] = useState<'plot' | 'map'>('plot')
  const [reading, setReading] = useState<PolarPlotReading>('knots')

  const mapCard = useRef<HTMLElement | null>(null)
  const plotCard = useRef<HTMLElement | null>(null)
  const readout = useRef<HTMLDivElement | null>(null)

  /** The map speaks `TrackRowFacts` and the plot speaks `row_index`: this is the join. */
  const factsByRow = useMemo(() => {
    const into = new Map<number, TrackRowFacts>()
    for (const segment of heatmap?.segments ?? []) into.set(segment.row.row_index, segment.row)
    for (const point of heatmap?.points ?? []) into.set(point.row.row_index, point.row)
    return into
  }, [heatmap])

  const facts = selected === null ? null : (factsByRow.get(selected) ?? null)
  const moment =
    selected === null ? null : (plot?.moments.find((each) => each.row_index === selected) ?? null)

  const families = useMemo(
    () =>
      plot === null
        ? []
        : [{ version_id: 'race', curves: certificateFamily(plot.polar, plot.moments.map((each) => each.tws)) }],
    [plot]
  )
  const rim = useMemo(
    () =>
      rimKnots([
        ...(plot?.moments.map((each) => each.sog) ?? []),
        ...(plot?.polar.boat_speed.flat() ?? []),
        ...(season?.map((bin) => bin.knots) ?? []),
      ]),
    [plot, season]
  )

  /*
   * Keep what was tapped visible above the readout: the page-level form of `TrackReadout` once
   * sitting in whichever half of the map the selection was not in. A nudge only when the mark is
   * actually covered, never a jump.
   */
  useEffect(() => {
    if (selected === null) return

    const frame = window.requestAnimationFrame(() => {
      const card = readout.current
      const mark = (tappedOn === 'plot' ? plotCard : mapCard).current?.querySelector(
        '[data-selected-mark]'
      )
      if (card === null || mark === null || mark === undefined) return

      const cardTop = card.getBoundingClientRect().top
      const markBottom = mark.getBoundingClientRect().bottom
      if (markBottom + CLEARANCE > cardTop) {
        window.scrollBy({ top: markBottom + CLEARANCE - cardTop, behavior: 'smooth' })
      }
    })

    return () => window.cancelAnimationFrame(frame)
  }, [selected, tappedOn])

  /** A ratio overlay on a race with no Polar would be an all-grey track with no explanation. */
  const offered = TRACK_OVERLAYS.filter((each) => hasPolar || !isRatioOverlay(each))
  const drawnSeconds = plot?.moments.reduce((total, each) => total + each.seconds, 0) ?? 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing(3) }}>
      {/*
       * The map's column is capped at 620px, ADR 0033's own rule: the frame's *shape* is fixed, so
       * width past that buys height nobody wants rather than detail. Two equal columns grew it to
       * about 960px tall at 1920. `items-stretch` is what aligns the two: equal heights, not
       * equal widths.
       */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,620px)_minmax(0,1fr)] xl:items-stretch">
        <Card title="Race track" subtitle="where the boat was" testId="race-track-card" ref={mapCard}>
          {heatmap === null ? (
            <p data-testid="track-no-fixes" style={{ ...NOTE_STYLE, fontSize: 'var(--text-sm)', fontStyle: 'italic' }}>
              No position was logged anywhere in this race window, so there is no track to draw.
            </p>
          ) : (
            <>
              <div
                data-testid="track-overlays"
                role="group"
                aria-label="What the track is coloured by"
                style={{ display: 'flex', flexWrap: 'wrap', gap: spacing(1) }}
              >
                {offered.map((each) => {
                  const chosen = each === overlay

                  return (
                    <button
                      key={each}
                      type="button"
                      aria-pressed={chosen}
                      data-overlay={each}
                      onClick={() => setOverlay(each)}
                      style={{
                        // 30px of height and the gutter below it: a thumb target in a row of six
                        // at 390px.
                        padding: '7px 11px',
                        borderRadius: 999,
                        border: `1px solid ${chosen ? 'var(--text-accent)' : 'var(--surface-border)'}`,
                        background: chosen ? 'var(--blue-muted)' : 'var(--surface-elevated)',
                        color: chosen ? 'var(--text-accent)' : 'var(--text-secondary)',
                        fontSize: 'var(--text-xs)',
                        fontWeight: chosen ? 700 : 500,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {TRACK_SCALES[each].chip}
                    </button>
                  )
                })}
              </div>

              <TrackHeatmapFrame
                heatmap={heatmap}
                label={MAP_LABEL}
                overlay={overlay}
                scoring={scoring}
                selected={facts}
                onSelect={(row) => {
                  setTappedOn('map')
                  setSelected(row?.row_index ?? null)
                }}
              />

              <TrackHeatmapLegend
                overlay={overlay}
                counts={heatmap.counts}
                scoring={scoring}
                annotations={heatmap.annotations.length}
              />
            </>
          )}
        </Card>

        <Card
          title="Boat performance vs. polars"
          subtitle="what it was doing there"
          testId="polar-plot-card"
          ref={plotCard}
        >
          {plot === null ? (
            <p style={{ ...NOTE_STYLE, fontSize: 'var(--text-sm)', fontStyle: 'italic' }}>
              {scoring === 'polar-unreadable'
                ? 'The Polar this race names could not be read, so there is nothing to draw its sailing against.'
                : 'This race records no Polar Version, so there is nothing to draw its sailing against.'}
            </p>
          ) : (
            <>
              <PolarPlotReadingToggle reading={reading} onReading={setReading} />
              <PolarPlot
                reading={reading}
                rim={rim}
                families={families}
                moments={plot.moments}
                trace={season ?? undefined}
                selectedRow={moment === null ? null : selected}
                onRow={(rowIndex) => {
                  setTappedOn('plot')
                  setSelected((was) => (was === rowIndex ? null : rowIndex))
                }}
                label={`Every scored moment of this race at its own wind angle and speed, against the boat's certificate: ${describeDuration(drawnSeconds)} of sailing. Tap a dot to read it, and to find it on the track.`}
              />
              <PolarPlotLegend form="dots" undrawn={plot.undrawn} />
            </>
          )}
        </Card>
      </div>

      <div ref={readout} className="sticky bottom-4 z-20">
        <SharedReadout
          facts={facts}
          moment={moment}
          hasPlot={plot !== null}
          overlay={overlay}
          scoring={scoring}
          onClear={() => setSelected(null)}
        />
      </div>
    </div>
  )
}

/** One titled card. Both halves are the same shell, which is what lets the eye compare across. */
function Card({
  title,
  subtitle,
  testId,
  ref,
  children,
}: {
  title: string
  subtitle: string
  testId: string
  ref: Ref<HTMLElement>
  children: ReactNode
}): ReactElement {
  return (
    <section
      ref={ref}
      data-testid={testId}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: spacing(2),
        minWidth: 0,
        padding: spacing(3),
        background: 'var(--surface-raised)',
        border: '1px solid var(--surface-border)',
        borderRadius: radius('md'),
      }}
    >
      <div>
        <h2
          style={{
            margin: 0,
            fontSize: 'var(--text-xs)',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--text-muted)',
          }}
        >
          {title}
        </h2>
        <p style={{ ...NOTE_STYLE, marginTop: 1 }}>{subtitle}</p>
      </div>
      {children}
    </section>
  )
}
