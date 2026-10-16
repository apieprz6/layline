import Link from 'next/link'
import type { ReactElement, ReactNode } from 'react'
import EmptyState from '@/components/common/EmptyState'
import { describeDuration } from '@/services/recordings/coverage'
import { wallClockWindow } from '@/services/recordings/wall-clock'
import type { RaceListEntry } from '@/types'
import {
  BODY_CLASS,
  ColumnHeaderRow,
  HEADER_STYLE,
  ROW_CLASS,
  ROW_STYLE,
  SECTION_HEADING_STYLE,
  SECTION_STYLE,
  TABLE_STYLE,
  TITLE_STYLE,
  TOOLBAR_STYLE,
  UPLOAD_BUTTON_STYLE,
  WIDE_CELL_CLASS,
  rowRule,
} from './boatPerformanceLayout'

interface BoatPerformanceContentProps {
  /** Newest first, as `readRaces` orders them. */
  races: RaceListEntry[]
  /** An admin, who may add one. Everyone signed in reads the same list (ADR 0019). */
  canWrite: boolean
  /**
   * The season's figures, rendered on the server and passed in.
   *
   * A node rather than data, because what fills the rail is a read across the whole archive —
   * thousands of rows, scored — and the race list must not wait on it. The page wraps it in its
   * own `<Suspense>`, so the archive list paints and the season figures stream in beside it.
   */
  season: ReactNode
}

/**
 * **Boat performance**: the season's figures in a rail, and the archive as a table beside it.
 *
 * Both at once, where they used to be two tabs (LAY-174's variant B, built on LAY-178): the rail
 * is a row of doors into the season's screens and the table is the way into one race, and neither
 * is the one a sailor should have to click past to reach the other. On a phone the rail stacks
 * above the table — see `BODY_CLASS`.
 *
 * The table states a **duration** and never a row count. A duration can be held against a sailor's
 * memory of the afternoon; "6,337 rows" cannot be held against anything, and counts a dead feed's
 * verbatim copies as evidence (ADR 0009). The race's own page states how much of that duration was
 * actually recorded.
 *
 * A race with no title shows its window and says so. An untitled race is normal (ADR 0010), and
 * generating "Race on Sep 4" here would be Layline writing Testimony the sailor withheld.
 *
 * ## A list of rows, not a `<table>`
 *
 * Each row is one door, so each row is one link, and a `<tr>` cannot be one: a table would mean a
 * link in the title cell stretched over its siblings, and a phone — where four columns do not fit
 * and the row falls back to a card — would mean changing the `display` of table elements, which
 * costs some browsers the table's semantics anyway. So it is a list of links, as it was before, and
 * the header row is drawn for the eye and hidden from a screen reader, which hears each race as one
 * link carrying all four figures, each named (see `RaceRow`).
 */
export default function BoatPerformanceContent({
  races,
  canWrite,
  season,
}: BoatPerformanceContentProps): ReactElement {
  return (
    <div className="min-h-screen" style={{ background: 'var(--page-bg)' }}>
      <div style={HEADER_STYLE}>
        <h1 style={TITLE_STYLE}>Boat performance</h1>
      </div>

      <div className={BODY_CLASS}>
        <section aria-labelledby="this-season-heading" style={SECTION_STYLE}>
          {/* In a toolbar row of its own, with nothing else in it, so it lines up with "Races"
              beside it rather than sitting half a button higher. */}
          <div style={TOOLBAR_STYLE}>
            <h2 id="this-season-heading" style={SECTION_HEADING_STYLE}>
              This season
            </h2>
          </div>
          {season}
        </section>

        <section aria-labelledby="races-heading" style={SECTION_STYLE}>
          <div style={TOOLBAR_STYLE}>
            <h2 id="races-heading" style={SECTION_HEADING_STYLE}>
              Races
              {/* No count of none: "Races · 0" above an empty state says the same thing twice. */}
              {races.length > 0 && (
                <span style={{ color: 'var(--text-muted)', fontWeight: 'var(--weight-regular)' }}>
                  {` · ${races.length}`}
                </span>
              )}
            </h2>

            {canWrite && (
              <Link href="/boat-performance/upload" style={UPLOAD_BUTTON_STYLE}>
                Upload a race
              </Link>
            )}
          </div>

          {races.length === 0 ? (
            <EmptyState
              mark="⛵"
              title="No races uploaded yet"
              detail="Races appear here once one has been logged, newest first."
            />
          ) : (
            <div style={TABLE_STYLE}>
              <ColumnHeaderRow />

              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {races.map((race, index) => (
                  <li key={race.id} style={rowRule(index)}>
                    <RaceRow race={race} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

/**
 * One race: its title, its window in the recording's own clock, its duration, and its file.
 *
 * Each figure after the title carries its column's name for a screen reader only, since the header
 * row is hidden from one: the link then reads "Verve Cup, window Aug 22 · 11:05 – 13:20, duration
 * 2h 15m, file …" rather than four figures run together with nothing to say which is which.
 */
function RaceRow({ race }: { race: RaceListEntry }): ReactElement {
  return (
    <Link
      href={`/boat-performance/races/${race.id}`}
      className={ROW_CLASS}
      style={{ ...ROW_STYLE, textDecoration: 'none' }}
    >
      <span
        className={WIDE_CELL_CLASS}
        style={{
          minWidth: 0,
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-base)',
          color: 'var(--text-primary)',
        }}
      >
        {race.title ?? 'Untitled race'}
      </span>
      <span
        className={WIDE_CELL_CLASS}
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-sm)',
          color: 'var(--text-accent)',
          whiteSpace: 'nowrap',
        }}
      >
        <span className="sr-only">, window </span>
        {wallClockWindow(race.window_start, race.window_finish)}
      </span>
      <span
        style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}
      >
        <span className="sr-only">, duration </span>
        {describeDuration(race.window_seconds)}
      </span>
      <span
        // The one column that gives way: a long filename is truncated before a title is, and the
        // whole of it is a tap away on the race's own page.
        style={{
          minWidth: 0,
          fontSize: 'var(--text-xs)',
          color: 'var(--text-muted)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        <span className="sr-only">, file </span>
        {race.filename}
      </span>
    </Link>
  )
}
