import Link from 'next/link'
import { Suspense, type ReactElement } from 'react'
import ArchiveUnreadable from '@/components/analysis/ArchiveUnreadable'
import { EYEBROW_STYLE } from '@/components/common/eyebrow'
import Skeleton, { SkeletonText } from '@/components/common/Skeleton'
import { DROPOUT } from '@/components/race/track-ink'
import { radius, spacing } from '@/lib/utils/design'
import { dropoutDuration } from '@/services/analysis/track-heatmap'
import { readLatestRace } from '@/services/races/readLatestRace'
import { describeDuration } from '@/services/recordings/coverage'
import { THUMBNAIL_BOX } from '@/services/recordings/track-thumbnail'
import { wallClockWindow } from '@/services/recordings/wall-clock'
import type { LatestRace, LatestRaceRead, TrackThumbnail } from '@/types'

/**
 * The Dashboard's **Most recent race** card (LAY-179): one cell of the grid, a door to that race.
 *
 * The read starts the moment this is called and is awaited only inside its own `<Suspense>`, so
 * Live Wind and the Overall cards beside it never wait on a Transcription being paged. A Guest
 * never reaches it — the page decides that — so a signed-out request reads nothing.
 *
 * With no races at all the card is **left off** rather than saying so: the owner chose that on
 * LAY-179, since the Overall cards beside it already say the archive is empty. A failed read is
 * different and is said, because an unreadable archive must never pass for an empty one.
 */
export default async function LatestRaceCard(): Promise<ReactElement> {
  const read = readLatestRace()

  return (
    <Suspense fallback={<LatestRaceSkeleton />}>
      <LatestRaceSlot read={read} />
    </Suspense>
  )
}

async function LatestRaceSlot({
  read,
}: {
  read: Promise<LatestRaceRead>
}): Promise<ReactElement | null> {
  const result = await read

  if (result.ok) return <LatestRaceTeaser race={result.race} />
  if (result.reason === 'unreadable') return <ArchiveUnreadable />
  return null
}

const CARD_STYLE = {
  display: 'flex',
  flexDirection: 'column',
  gap: spacing(1),
  background: 'var(--surface-raised)',
  border: '1px solid var(--surface-border)',
  borderRadius: radius('md'),
  padding: spacing(3),
} as const

/** Text over the map, as agreed with the owner on LAY-179: what the race was, then where. */
function LatestRaceTeaser({ race }: { race: LatestRace }): ReactElement {
  return (
    <Link
      href={`/boat-performance/races/${race.id}`}
      data-testid="latest-race-card"
      style={{ ...CARD_STYLE, textDecoration: 'none' }}
    >
      <span style={{ ...EYEBROW_STYLE, marginBottom: 0 }}>Most recent race</span>

      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-lg)',
          color: 'var(--text-primary)',
        }}
      >
        {/* An untitled race is normal (ADR 0010); a generated name would be Testimony nobody gave. */}
        {race.title ?? 'Untitled race'}
      </span>

      <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: spacing(2) }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-sm)',
            color: 'var(--text-accent)',
          }}
        >
          {wallClockWindow(race.window_start, race.window_finish)}
        </span>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          {describeDuration(race.window_seconds)}
        </span>
      </span>

      {race.track === null ? (
        <span
          style={{
            marginTop: spacing(1),
            fontSize: 'var(--text-sm)',
            color: 'var(--text-muted)',
            fontStyle: 'italic',
          }}
        >
          No GPS fix was recorded in this race’s window, so there is no track to draw.
        </span>
      ) : (
        <TrackPicture track={race.track} />
      )}

      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
        Tap for the race’s own page.
      </span>
    </Link>
  )
}

/** The track's one ink: the accent, which nothing on this card means anything else by. */
const TRACK_INK = { stroke: 'var(--text-accent)', width: 2 } as const

/** Type in the frame's own units. The frame is drawn about 1:1 on a phone, so this reads as 9px. */
const LABEL_SIZE = 9

/**
 * The track itself, static: no legend, scale, zoom or pan, and no colour that means a score.
 *
 * Every Dropout is still broken, ringed and bridged, and every bridge carries its duration —
 * unlike the heatmap, which labels only the bridges with room, because there the sailor can zoom
 * in to reveal the rest and here nothing can.
 */
function TrackPicture({ track }: { track: TrackThumbnail }): ReactElement {
  const { width, height } = track

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={
        track.bridges.length === 0
          ? 'The race’s track'
          : `The race’s track, with the instrument feed dead ${track.bridges
              .map((bridge) => dropoutDuration(bridge.seconds))
              .join(', ')}`
      }
      style={{
        display: 'block',
        width: '100%',
        aspectRatio: `${width} / ${height}`,
        marginTop: spacing(1),
        background: 'var(--surface-base)',
        borderRadius: radius('sm'),
      }}
    >
      {track.runs.map((points, index) => (
        <polyline
          key={`run-${index}`}
          points={points}
          fill="none"
          stroke={TRACK_INK.stroke}
          strokeWidth={TRACK_INK.width}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}

      {track.points.map((point, index) => (
        <circle
          key={`point-${index}`}
          cx={point.x}
          cy={point.y}
          r={TRACK_INK.width}
          fill={TRACK_INK.stroke}
        />
      ))}

      {track.rings.map((ring, index) => (
        <circle
          key={`frozen-${index}`}
          cx={ring.cx}
          cy={ring.cy}
          r={DROPOUT.ringRadius}
          fill="none"
          stroke={DROPOUT.stroke}
          strokeWidth={DROPOUT.ringWidth}
          opacity={DROPOUT.ringOpacity}
        />
      ))}

      {track.bridges.map((bridge, index) => {
        const label = `feed dead ${dropoutDuration(bridge.seconds)}`
        // About 0.56em per character in the mono face, near enough to keep the label in frame:
        // a label clipped to `feed dead` with no duration is worse than none.
        const half = (label.length * LABEL_SIZE * 0.56) / 2
        const x = Math.min(Math.max((bridge.x1 + bridge.x2) / 2, half + 2), width - half - 2)
        const y = Math.max((bridge.y1 + bridge.y2) / 2 - 3, LABEL_SIZE + 2)

        return (
          <g key={`bridge-${index}`} data-testid="track-bridge">
            <line
              x1={bridge.x1}
              y1={bridge.y1}
              x2={bridge.x2}
              y2={bridge.y2}
              stroke={DROPOUT.stroke}
              strokeWidth={DROPOUT.bridgeWidth}
              strokeDasharray={DROPOUT.bridgeDash}
              opacity={DROPOUT.bridgeOpacity}
            />
            <text
              x={x}
              y={y}
              textAnchor="middle"
              fontSize={LABEL_SIZE}
              fontFamily="var(--font-mono)"
              fill={DROPOUT.stroke}
              stroke="var(--surface-base)"
              strokeWidth={2.4}
              paintOrder="stroke"
            >
              {label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/**
 * The card's own shape while the Transcription pages in: the same box, three lines of text and a
 * frame at the thumbnail's own aspect ratio, so the placeholder is the card's height at any width.
 */
function LatestRaceSkeleton(): ReactElement {
  return (
    <div style={CARD_STYLE} aria-hidden="true">
      <SkeletonText fontSize="var(--text-xs)" width="40%" />
      <SkeletonText fontSize="var(--text-lg)" width="60%" />
      <SkeletonText fontSize="var(--text-sm)" width="70%" />
      <Skeleton
        radius="var(--radius-sm)"
        style={{
          aspectRatio: `${THUMBNAIL_BOX.width} / ${THUMBNAIL_BOX.height}`,
          marginTop: spacing(1),
        }}
      />
      <SkeletonText fontSize="var(--text-xs)" width="45%" />
    </div>
  )
}
