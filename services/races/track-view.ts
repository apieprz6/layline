import type { RaceTrack, RaceTrackView } from '@/types'

/**
 * The track as the race page's client sections receive it: everything they draw, without the runs.
 *
 * The runs are the map put as time spans for the MCP's `race_track`, six overlays of them, and the
 * map draws its own strokes instead — so they stay on the server rather than ride to a phone that
 * never reads them.
 */
export function trackView(track: RaceTrack): RaceTrackView {
  if (track.heatmap === null) return { ...track, heatmap: null }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- taken off, not read
  const { runs, ...heatmap } = track.heatmap
  return { ...track, heatmap }
}
