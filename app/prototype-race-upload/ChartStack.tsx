'use client'

/**
 * THROWAWAY — the chart stack: GPS track above, one swappable channel below,
 * both cropped by the same window.
 *
 * This is the piece that makes the revised wizard work. It is mounted once and
 * carried through every step; only what you are allowed to do to it changes.
 * That is the point: the sailor never loses sight of the race while answering
 * questions about it, and never has to re-establish where they are.
 *
 *   mode 'window'   drag either scrubber; markers are visible but frozen
 *   mode 'sail'     tap the track or the chart to place a sail change; the
 *                   window is fixed and sea-state markers are read-only
 *   mode 'sea'      the same for sea state; sail markers are read-only
 *   mode 'readonly' nothing is editable — the review step
 *
 * The two scrubbers are the same state, so dragging either moves both. They are
 * not "linked"; there is only one window.
 */

import ChannelChart, { TraceLegend } from './ChannelChart'
import TrackMap from './TrackMap'
import {
  CHANNELS,
  CHANNEL_ORDER,
  costMeter,
  fmtWindow,
  type ChannelKey,
  type ChartMarker,
  type Fixture,
} from './shared'

export type StackMode = 'window' | 'sail' | 'sea' | 'readonly'

interface ChartStackProps {
  fixture: Fixture
  channel: ChannelKey
  onChannelChange: (c: ChannelKey) => void
  windowStart: string
  windowFinish: string
  onWindowChange?: (start: string, finish: string) => void
  mode: StackMode
  markers: ChartMarker[]
  onTapTime?: (at: string) => void
  onMarkerTap?: (id: string) => void
  cursorAt?: string | null
  /** Compact form for the review step, where the charts are evidence rather than a tool. */
  compact?: boolean
}

export default function ChartStack({
  fixture,
  channel,
  onChannelChange,
  windowStart,
  windowFinish,
  onWindowChange,
  mode,
  markers,
  onTapTime,
  onMarkerTap,
  cursorAt,
  compact,
}: ChartStackProps) {
  const editable = mode !== 'readonly'
  const meta = CHANNELS[channel]
  const laneHeight = markers.length > 0 ? 16 : 0
  const placing = mode === 'sail' || mode === 'sea'

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
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '6px 9px',
          borderBottom: '1px solid var(--surface-border)',
        }}
      >
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-accent)' }}>
          {fmtWindow(windowStart, windowFinish)}
        </span>
        <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          {mode === 'window'
            ? 'drag to crop'
            : mode === 'sail'
              ? 'tap to place a sail change'
              : mode === 'sea'
                ? 'tap to place a sea state'
                : 'window fixed'}
        </span>
      </div>

      <TrackMap
        fixture={fixture}
        windowStart={windowStart}
        windowFinish={windowFinish}
        height={compact ? 168 : 214}
        onWindowChange={mode === 'window' ? onWindowChange : undefined}
        markers={markers}
        onTapTime={placing ? onTapTime : undefined}
        onMarkerTap={editable ? onMarkerTap : undefined}
        cursorAt={cursorAt}
      />

      {/* channel switch: one chart slot, four channels, so the second chart never
          competes with the track for the screen */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 8px 2px' }}>
        {CHANNEL_ORDER.map((k) => {
          const on = k === channel
          return (
            <button
              key={k}
              onClick={() => {
                costMeter.bump()
                onChannelChange(k)
              }}
              style={{
                flex: 1,
                padding: '6px 2px',
                borderRadius: 5,
                fontSize: 10.5,
                fontFamily: 'var(--font-mono)',
                fontWeight: on ? 700 : 500,
                cursor: 'pointer',
                border: `1px solid ${on ? 'var(--blue-500)' : 'var(--surface-border)'}`,
                background: on ? 'var(--blue-500)' : 'var(--surface-raised)',
                color: on ? '#fff' : 'var(--text-secondary)',
              }}
            >
              {CHANNELS[k].label}
            </button>
          )
        })}
      </div>

      <div style={{ padding: '0 4px' }}>
        <ChannelChart
          fixture={fixture}
          channel={channel}
          windowStart={windowStart}
          windowFinish={windowFinish}
          height={(compact ? 104 : 124) + laneHeight}
          onWindowChange={mode === 'window' ? onWindowChange : undefined}
          markers={markers}
          onTapTime={placing ? onTapTime : undefined}
          onMarkerTap={editable ? onMarkerTap : undefined}
          laneHeight={laneHeight}
          cursorAt={cursorAt}
        />
      </div>

      {/* ADR 0008 ruling 6: one generated sentence about where the number came
          from, not a badge per number. It changes with the channel. */}
      <div
        style={{
          padding: '6px 10px 9px',
          borderTop: '1px solid var(--surface-border)',
          fontSize: 10,
          lineHeight: 1.45,
          color: 'var(--text-muted)',
        }}
      >
        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
          {meta.label} · column “{meta.sourceColumn}”
        </span>{' '}
        — {meta.provenance}
        {!compact && <TraceLegend channel={channel} />}
      </div>
    </div>
  )
}
