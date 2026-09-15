'use client'

/**
 * The map and the channel chart, as one thing.
 *
 * This component is **mounted once** and never remounted between steps (ADR 0014). That is the whole
 * decision the ticket rests on: the charts do not leave the screen, so a sailor who chose TWS on the
 * Window step still has TWS on Review, and the track they are looking at does not blink away and come
 * back re-projected. The step is a `mode`, not a different screen.
 *
 * Both charts read one `axis` and one `window`, so there is one scrubber with two grips rather than
 * two scrubbers that agree most of the time. Dragging the rail under the map and dragging the handles
 * on the chart are the same state, and neither can be a fraction of a second out of step with the
 * other, because there is nothing to be out of step with.
 *
 * Side by side from 1024px, stacked below. On a phone the map takes the top of the pane and the chart
 * the bottom; on a laptop they sit next to each other and neither has to be scrolled to.
 */

import { useCallback, type ReactElement } from 'react'
import type { RaceChartAxis } from '@/services/recordings/chart-series'
import { RACE_CHANNELS, raceChannel } from '@/services/recordings/chart-series'
import type { RaceWindowSeconds } from '@/services/recordings/race-window'
import { wallClockStamp, wallClockWindow } from '@/services/recordings/wall-clock'
import type { RaceChannelKey, RaceChartSeries } from '@/types'

import ChannelChart, { TraceLegend } from './ChannelChart'
import TrackMap from './TrackMap'

/** What the step asks of the stack. Sails and Sea state add their own modes in later tickets. */
export type StackMode = 'window' | 'readonly'

interface ChartStackProps {
  series: RaceChartSeries
  axis: RaceChartAxis
  window: RaceWindowSeconds
  channel: RaceChannelKey
  onChannelChange: (channel: RaceChannelKey) => void
  mode: StackMode
  /** Only called in `window` mode. */
  onWindowChange: (window: RaceWindowSeconds) => void
  /** A tap, in seconds, on either chart. Only called in `window` mode. */
  onTapTime: (seconds: number) => void
  /** Shorter charts and no legend, for the Review step where the list below is what matters. */
  compact?: boolean
}

export default function ChartStack({
  series,
  axis,
  window,
  channel,
  onChannelChange,
  mode,
  onWindowChange,
  onTapTime,
  compact = false,
}: ChartStackProps): ReactElement {
  const editing = mode === 'window'
  const meta = raceChannel(channel)

  const handleWindowChange = useCallback(
    (next: RaceWindowSeconds) => {
      if (editing) onWindowChange(next)
    },
    [editing, onWindowChange]
  )

  const handleTap = useCallback(
    (seconds: number) => {
      if (editing) onTapTime(seconds)
    },
    [editing, onTapTime]
  )

  const mapHeight = compact ? 168 : 214
  const chartHeight = compact ? 104 : 124

  return (
    <div
      style={{
        background: 'var(--surface-raised)',
        border: '1px solid var(--surface-border)',
        borderRadius: 8,
        boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 8,
          padding: '6px 9px',
          borderBottom: '1px solid var(--surface-border)',
        }}
      >
        {/* The window, always on screen, in the recording's own clock. */}
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--text-accent)',
          }}
        >
          {wallClockWindow(wallClockStamp(window.start), wallClockStamp(window.finish))}
        </span>
        <span
          style={{
            fontSize: 9,
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
            color: 'var(--text-muted)',
          }}
        >
          {editing ? 'Drag the ends · tap to snap' : 'The window as saved'}
        </span>
      </div>

      <div className="flex flex-col lg:flex-row lg:justify-center lg:items-start">
        <div className="lg:flex-1 lg:min-w-0 lg:max-w-[720px]">
          <TrackMap
            series={series}
            axis={axis}
            window={window}
            height={mapHeight}
            onWindowChange={editing ? handleWindowChange : undefined}
            onTapTrack={editing ? handleTap : undefined}
          />
        </div>

        <div
          className="lg:flex-1 lg:min-w-0 lg:max-w-[720px] border-t lg:border-t-0 lg:border-l"
          style={{ borderColor: 'var(--surface-border)' }}
        >
          {/* The pill row lives with the chart it swaps, and its choice is the wizard's state, so it
              survives every step change. */}
          <div style={{ display: 'flex', gap: 4, padding: '6px 8px 2px' }} role="group" aria-label="Channel">
            {RACE_CHANNELS.map((each) => {
              const on = each.key === channel
              return (
                <button
                  key={each.key}
                  type="button"
                  onClick={() => onChannelChange(each.key)}
                  aria-pressed={on}
                  style={{
                    flex: 1,
                    padding: '6px 2px',
                    borderRadius: 5,
                    border: '1px solid var(--surface-border)',
                    background: on ? 'var(--blue-500)' : 'var(--surface-elevated)',
                    color: on ? '#fff' : 'var(--text-secondary)',
                    fontSize: 10.5,
                    fontFamily: 'var(--font-mono)',
                    fontWeight: on ? 700 : 500,
                    cursor: 'pointer',
                  }}
                >
                  {each.label}
                </button>
              )
            })}
          </div>

          <ChannelChart
            series={series}
            channel={channel}
            axis={axis}
            window={window}
            height={chartHeight}
            onWindowChange={editing ? handleWindowChange : undefined}
            onTapTime={editing ? handleTap : undefined}
          />
        </div>
      </div>

      {/* One generated sentence about where this channel's numbers came from — never a badge per
          value (ADR 0008, ruling 6). */}
      <div
        style={{
          padding: '6px 9px 8px',
          borderTop: '1px solid var(--surface-border)',
          fontSize: 10,
          lineHeight: 1.45,
          color: 'var(--text-muted)',
        }}
      >
        {meta.label} · column “{meta.source_column}” — {meta.provenance}
        {!compact && <TraceLegend channel={channel} />}
      </div>
    </div>
  )
}
