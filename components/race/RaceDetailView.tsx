/**
 * One race, stating what it is and how much of itself was actually recorded.
 *
 * Testimony first, measurement second. The window the sailor set, then what they said was up and what
 * the water was doing, then the coverage of that window **in time**, then the Row Quality notes. The
 * order is the argument — everything under the Testimony is Layline measuring how well the recording
 * backs it up (ADR 0010).
 *
 * An annotation that was never given is stated as **not recorded**, in a treatment nothing else on the
 * page uses. That is the whole reason the empty case is drawn at all: a silent section reads as a race
 * with no sail changes, and "nobody wrote it down" is a different fact from "nothing changed".
 *
 * There is no row count anywhere on this page and there is not going to be one (ADR 0009). Coverage
 * and the notes are computed at read, over the whole Transcription and then filtered, and stored
 * nowhere — so moving the Dropout gates is a redeploy rather than a migration over stale text.
 *
 * A missing title is a missing title. An untitled race shows its day, and nothing here writes it a
 * name the sailor did not give it.
 */

import type { ReactElement } from 'react'
import Link from 'next/link'
import { spacing } from '@/lib/utils/design'
import { reefLabel, seaStateLabel, SEA_STATES } from '@/services/races/annotations'
import { wallClockDay, wallClockTime, wallClockWindow } from '@/services/recordings/wall-clock'
import type { RaceDetail } from '@/types'

import CoverageReadout from './CoverageReadout'
import RaceFindings from './RaceFindings'

interface RaceDetailViewProps {
  race: RaceDetail
}

export default function RaceDetailView({ race }: RaceDetailViewProps): ReactElement {
  return (
    <div className="min-h-screen" style={{ background: 'var(--page-bg)' }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: spacing(4),
          padding: spacing(4),
          maxWidth: 720,
        }}
      >
        <Link
          href="/boat-performance"
          style={{
            fontSize: 'var(--text-xs)',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--text-accent)',
            textDecoration: 'none',
          }}
        >
          ← Races
        </Link>

        <header style={{ display: 'flex', flexDirection: 'column', gap: spacing(1) }}>
          <h1
            style={{
              margin: 0,
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-xl)',
              color: 'var(--text-primary)',
            }}
          >
            {race.title ?? wallClockDay(race.window_start)}
          </h1>
          <p
            style={{
              margin: 0,
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-sm)',
              color: 'var(--text-accent)',
            }}
          >
            {wallClockWindow(race.window_start, race.window_finish)}
          </p>
          <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            The recording’s own clock, exactly as its instruments wrote it — no timezone was applied
            in either direction.
          </p>
        </header>

        <section style={{ display: 'flex', flexDirection: 'column', gap: spacing(2) }}>
          <h2 style={SECTION_HEADING}>Sails</h2>
          {race.annotations.sails.length > 0 ? (
            <Testimony
              entries={race.annotations.sails.map((entry) => ({
                at: entry.at,
                text: `${entry.sails.map((sail) => sail.label).join(' + ')} · ${reefLabel(
                  entry.reef
                )}`,
              }))}
              day={race.window_start}
            />
          ) : (
            <NotRecorded>Not recorded — nobody wrote down which sails were up.</NotRecorded>
          )}
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: spacing(2) }}>
          <h2 style={SECTION_HEADING}>Sea state</h2>
          {race.annotations.sea_state.length > 0 ? (
            <Testimony
              entries={race.annotations.sea_state.map((entry) => ({
                at: entry.at,
                text: seaStateWithHeight(entry.sea_state),
              }))}
              day={race.window_start}
            />
          ) : (
            <NotRecorded>
              Not recorded — nobody wrote down what the water was doing.
            </NotRecorded>
          )}
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: spacing(2) }}>
          <h2 style={SECTION_HEADING}>Coverage</h2>
          <CoverageReadout coverage={race.coverage} />
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: spacing(2) }}>
          <h2 style={SECTION_HEADING}>Row Quality</h2>
          {race.findings.length > 0 ? (
            <RaceFindings findings={race.findings} />
          ) : (
            <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
              Nothing to note: the feed was alive throughout this window and the recording reaches
              both ends of it.
            </p>
          )}
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: spacing(2) }}>
          <h2 style={SECTION_HEADING}>Recording</h2>
          <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: spacing(1) }}>
            <Fact label="File">{race.recording.filename}</Fact>
            {/* The whole log, which the window is a stretch of. A window may reach past the last row,
                so these two are stated rather than implied by the window above. */}
            <Fact label="Rows run from">{race.recording.first_row_time.replace('T', ' ')}</Fact>
            <Fact label="to">{race.recording.last_row_time.replace('T', ' ')}</Fact>
            <Fact label="Columns">{String(race.recording.source_columns.length)}</Fact>
          </dl>
        </section>
      </div>
    </div>
  )
}

/**
 * A Sea State with the height that tells it apart, because "moderate" alone is a word the reader has
 * to take on trust. The wizard's chips carry the same pair, so the page reads back what was tapped.
 */
function seaStateWithHeight(value: string): string {
  const sea = SEA_STATES.find((each) => each.value === value)
  return sea ? `${sea.label} · ${sea.height}` : seaStateLabel(value)
}

const SECTION_HEADING = {
  margin: 0,
  fontSize: 'var(--text-xs)',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.1em',
  color: 'var(--text-muted)',
}

/**
 * A list of what the sailor said, earliest first, each with the time they said it about.
 *
 * The clock carries the day only where the entry is on a different one from the window's start — a
 * distance race runs through midnight, and an entry stamped `01:12` with no day would read as an hour
 * before a race that started at nine in the evening.
 *
 * The first entry is not special. There is no initial value beside a list of changes (ADR 0010): what
 * was up at any moment of the race is resolved at read from this list and is never stored on a row.
 */
function Testimony({
  entries,
  day,
}: {
  entries: readonly { at: string; text: string }[]
  day: string
}): ReactElement {
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
      {entries.map((entry) => (
        <li
          key={entry.at}
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: spacing(2),
            padding: '3px 0',
            fontSize: 'var(--text-sm)',
          }}
        >
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-accent)' }}>
            {entry.at.slice(0, 10) === day.slice(0, 10)
              ? wallClockTime(entry.at)
              : `${wallClockDay(entry.at)} · ${wallClockTime(entry.at)}`}
          </span>
          <span style={{ color: 'var(--text-primary)' }}>{entry.text}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * Missing Testimony, drawn as unlike a value as the page can manage.
 *
 * Italic, muted, dashed and hatched — nothing else here looks like this, because the one thing this
 * must never be mistaken for is a stated answer. ADR 0008's missing value is null all the way to the
 * screen, and this is what null looks like when a sailor reads it.
 */
function NotRecorded({ children }: { children: string }): ReactElement {
  return (
    <p
      style={{
        margin: 0,
        padding: spacing(2),
        border: '1px dashed var(--surface-border)',
        borderRadius: 'var(--radius-sm)',
        background:
          'repeating-linear-gradient(45deg, transparent, transparent 5px, var(--surface-elevated) 5px, var(--surface-elevated) 10px)',
        fontStyle: 'italic',
        fontSize: 'var(--text-sm)',
        color: 'var(--text-muted)',
      }}
    >
      {children}
    </p>
  )
}

function Fact({ label, children }: { label: string; children: string }): ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: spacing(2) }}>
      <dt style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', flex: 1 }}>{label}</dt>
      <dd
        style={{
          margin: 0,
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-sm)',
          color: 'var(--text-primary)',
        }}
      >
        {children}
      </dd>
    </div>
  )
}
