import Link from 'next/link'
import { Suspense, type ReactElement } from 'react'
import ArchiveUnreadable from '@/components/analysis/ArchiveUnreadable'
import { EYEBROW_STYLE } from '@/components/common/eyebrow'
import Skeleton, { SkeletonText } from '@/components/common/Skeleton'
import { DROPOUT } from '@/components/race/track-ink'
import { radius, spacing } from '@/lib/utils/design'
import { readLatestRace } from '@/services/races/readLatestRace'
import { describeDuration } from '@/services/recordings/coverage'
import { dropoutDuration } from '@/services/recordings/track-breaks'
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

/** The text column beside the track: it takes the room, and the track keeps its own size. */
const ROW_STYLE = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: spacing(3),
} as const

/**
 * What the race was, with its track beside the title as a small detail rather than the card's
 * subject — the owner's call on LAY-179, after a full-width map made this the tallest card on the
 * Dashboard for the least information.
 */
function LatestRaceTeaser({ race }: { race: LatestRace }): ReactElement {
  const bridges = race.track?.bridges ?? []

  return (
    <Link
      href={`/boat-performance/races/${race.id}`}
      data-testid="latest-race-card"
      style={{ ...CARD_STYLE, textDecoration: 'none' }}
    >
      <span style={{ ...EYEBROW_STYLE, marginBottom: 0 }}>Most recent race</span>

      <span style={ROW_STYLE}>
        <span style={{ display: 'flex', flexDirection: 'column', gap: spacing(1), minWidth: 0 }}>
          {/* The display face at the race list's size, and at the weight Live Wind's station
              names use beside it, so the two cards' names read as one type. */}
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 'var(--weight-semibold)',
              fontSize: 'var(--text-base)',
              color: 'var(--text-primary)',
            }}
          >
            {/* An untitled race is normal (ADR 0010); a generated name would be Testimony nobody gave. */}
            {race.title ?? 'Untitled race'}
          </span>

          <span
            style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: spacing(2) }}
          >
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

          {/* The bridges' durations, in words beside the picture: at this size a label on the
              map is unreadable, and a bridge without its duration only half-discharges ADR 0014. */}
          {bridges.length > 0 && (
            <span style={{ fontSize: 'var(--text-xs)', color: DROPOUT.stroke }}>
              Feed dead {bridges.map((bridge) => dropoutDuration(bridge.seconds)).join(', ')}
            </span>
          )}

          {race.track === null && (
            <span
              style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontStyle: 'italic' }}
            >
              No GPS fix was recorded in this race’s window, so there is no track to draw.
            </span>
          )}
        </span>

        {race.track !== null && <TrackPicture track={race.track} />}
      </span>
    </Link>
  )
}

/**
 * The track's one ink, and the Dropout marks scaled to a frame a quarter the heatmap's width.
 *
 * The heatmap's own ring and dash would swallow a 96-unit frame, so the sizes are this picture's;
 * the colour is `DROPOUT`'s, so a dead feed is the same red on both maps.
 */
const INK = {
  track: { stroke: 'var(--text-accent)', width: 1.5 },
  ringRadius: 2.2,
  ringWidth: 0.8,
  bridgeDash: '2.5 2',
  bridgeWidth: 0.9,
} as const

/**
 * The track itself, static and small: no legend, scale, zoom, pan or labels, and no colour that
 * means a score. Every Dropout is still broken, ringed and bridged; the durations are the text
 * beside it.
 */
function TrackPicture({ track }: { track: TrackThumbnail }): ReactElement {
  const { width, height } = track

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
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
        flexShrink: 0,
        background: 'var(--surface-base)',
        borderRadius: radius('sm'),
      }}
    >
      {track.runs.map((points, index) => (
        <polyline
          key={`run-${index}`}
          points={points}
          fill="none"
          stroke={INK.track.stroke}
          strokeWidth={INK.track.width}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}

      {track.points.map((point, index) => (
        <circle
          key={`point-${index}`}
          cx={point.x}
          cy={point.y}
          r={INK.track.width}
          fill={INK.track.stroke}
        />
      ))}

      {track.rings.map((ring, index) => (
        <circle
          key={`frozen-${index}`}
          cx={ring.cx}
          cy={ring.cy}
          r={INK.ringRadius}
          fill="none"
          stroke={DROPOUT.stroke}
          strokeWidth={INK.ringWidth}
          opacity={DROPOUT.ringOpacity}
        />
      ))}

      {track.bridges.map((bridge, index) => (
        <line
          key={`bridge-${index}`}
          data-testid="track-bridge"
          x1={bridge.x1}
          y1={bridge.y1}
          x2={bridge.x2}
          y2={bridge.y2}
          stroke={DROPOUT.stroke}
          strokeWidth={INK.bridgeWidth}
          strokeDasharray={INK.bridgeDash}
        />
      ))}
    </svg>
  )
}

/** The card's own shape while the Transcription pages in: two lines of text beside the frame. */
function LatestRaceSkeleton(): ReactElement {
  return (
    <div style={CARD_STYLE} aria-hidden="true">
      <SkeletonText fontSize="var(--text-xs)" width="40%" />
      <div style={ROW_STYLE}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing(1), flex: 1 }}>
          <SkeletonText fontSize="var(--text-base)" width="60%" />
          <SkeletonText fontSize="var(--text-sm)" width="80%" />
        </div>
        <Skeleton
          width={`${THUMBNAIL_BOX.width}px`}
          height={`${THUMBNAIL_BOX.height}px`}
          radius="var(--radius-sm)"
          style={{ flexShrink: 0 }}
        />
      </div>
    </div>
  )
}
