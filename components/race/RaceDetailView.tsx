/**
 * One race, stating what it is and how much of itself was actually recorded.
 *
 * Three things, in this order: the window the sailor set, the coverage of that window **in time**, and
 * the Row Quality notes. The order is the argument — the window is Testimony and comes first, and
 * everything under it is Layline measuring how well the recording backs it up (ADR 0010).
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
import { wallClockDay, wallClockWindow } from '@/services/recordings/wall-clock'
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

const SECTION_HEADING = {
  margin: 0,
  fontSize: 'var(--text-xs)',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.1em',
  color: 'var(--text-muted)',
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
