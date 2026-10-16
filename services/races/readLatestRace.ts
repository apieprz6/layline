/**
 * The newest Race and its track, for the Dashboard's **Most recent race** card (LAY-179).
 *
 * Two round trips and no more: one race lookup, then every page of its Transcription at once
 * (`readRecordingPages` asks for them together). The archive rows the Overall cards already read
 * carry no positions, so this cannot borrow theirs.
 *
 * **Not a position-only read.** That was the cheap option the ticket asked after, and it cannot
 * mark a Dropout: Row Quality finds one by comparing `COG` and `SOG` beside the fix verbatim. So it
 * pages Row Quality's eight columns, not the race page's eleven — the three wind channels are what
 * a score needs, and nothing here scores.
 *
 * Newest by `window_start`, the race's own date, as `readRaces` orders the list — never by upload.
 * No Role is consulted: `races` and `recording_rows` are readable to any signed-in Account, and the
 * Dashboard keeps a Guest from calling this at all (ADR 0015, ADR 0019).
 */

import { createClient } from '@/lib/supabase/server'
import { readRecordingQualityRows } from '@/services/races/recording-rows'
import { trackThumbnail } from '@/services/recordings/track-thumbnail'
import { wallClockSeconds } from '@/services/recordings/wall-clock'
import type { LatestRaceRead } from '@/types'

const RACE_SELECT = 'id, title, window_start, window_finish, recordings!inner(id, row_count)'

interface RaceRow {
  id: string
  title: string | null
  window_start: string
  window_finish: string
  recordings: { id: string; row_count: number }
}

export async function readLatestRace(): Promise<LatestRaceRead> {
  let supabase: Awaited<ReturnType<typeof createClient>>

  try {
    supabase = await createClient()
  } catch (thrown: unknown) {
    console.error(
      'Latest race: Supabase client unavailable:',
      thrown instanceof Error ? thrown.message : thrown
    )
    return { ok: false, reason: 'unreadable' }
  }

  const { data, error } = await supabase
    .from('races')
    .select(RACE_SELECT)
    .order('window_start', { ascending: false })
    .limit(1)
    .returns<RaceRow[]>()

  if (error) {
    console.error('Latest race: race read failed:', error.message)
    return { ok: false, reason: 'unreadable' }
  }

  const race = data?.[0]
  if (!race) return { ok: false, reason: 'no-races' }

  const rows = await readRecordingQualityRows(
    supabase,
    race.recordings.id,
    race.recordings.row_count
  )

  // A Transcription that came back short is unreadable, not trackless: drawing what did load
  // would be a thumbnail of part of a race presented as the whole of it.
  if (rows === null) return { ok: false, reason: 'unreadable' }

  try {
    const raceWindow = { window_start: race.window_start, window_finish: race.window_finish }

    return {
      ok: true,
      race: {
        id: race.id,
        title: race.title,
        ...raceWindow,
        window_seconds: wallClockSeconds(race.window_finish) - wallClockSeconds(race.window_start),
        track: trackThumbnail(rows, raceWindow),
      },
    }
  } catch (thrown: unknown) {
    // A stamp the wall clock cannot read is a column holding something Layline did not write.
    console.error(
      'Latest race: a stamp is not a naive wall-clock stamp:',
      thrown instanceof Error ? thrown.message : thrown
    )
    return { ok: false, reason: 'unreadable' }
  }
}
