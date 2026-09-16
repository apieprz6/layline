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
 *
 * The Boat Setup the race was sailed under sits between the Testimony and the coverage, because it is
 * neither: it is what the boat *was*, stated as the pointers the Race holds and never resolved afresh
 * (ADR 0012). A pointer nobody set reads as not recorded, in the same treatment, for the same reason.
 *
 * Writes are the thing the Role gates, and there are two of them: amending the Boat Setup and deleting
 * the race. Both are absent for a viewer rather than present and refused (ADR 0019). Delete sits last,
 * under everything the race says about itself, because a destructive action above the record it destroys
 * is one that gets pressed before the record is read.
 */

import type { ReactElement } from 'react'
import Link from 'next/link'
import { formatBandRange } from '@/lib/boat/rigTune'
import { spacing } from '@/lib/utils/design'
import { noteText, sailWithNote, seaStateLabel, SEA_STATES } from '@/services/races/annotations'
import { wallClockDay, wallClockTime, wallClockWindow } from '@/services/recordings/wall-clock'
import type {
  BoatSetupVersionRef,
  CrossoverChartChoice,
  DeleteRaceResult,
  RaceBoatSetup,
  RaceBoatSetupChoices,
  RaceBoatSetupPointers,
  RaceDetail,
  RaceSailAnnotation,
  UpdateRaceBoatSetupResult,
  WindBandRef,
} from '@/types'

import CoverageReadout from './CoverageReadout'
import RaceBoatSetupPanel from './RaceBoatSetupPanel'
import RaceDeletePanel from './RaceDeletePanel'
import RaceFindings from './RaceFindings'

interface RaceDetailViewProps {
  race: RaceDetail
  /** Whether this account may write. False for a viewer, and then neither write is drawn at all. */
  canWrite: boolean
  /**
   * The Versions the Boat Setup panel may name, read on the page, or null where the read failed.
   *
   * Both are only ever asked for when the panel is going to be drawn, so a viewer's page does not read
   * the boat's Version history in order to render nothing with it.
   */
  boatSetupChoices: RaceBoatSetupChoices | null
  charts: CrossoverChartChoice[] | null
  amendBoatSetup: (
    raceId: string,
    setup: RaceBoatSetupPointers,
    clearing: number
  ) => Promise<UpdateRaceBoatSetupResult>
  deleteRace: (raceId: string) => Promise<DeleteRaceResult>
}

export default function RaceDetailView({
  race,
  canWrite,
  boatSetupChoices,
  charts,
  amendBoatSetup,
  deleteRace,
}: RaceDetailViewProps): ReactElement {
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
                text: sailText(entry),
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
          <h2 style={SECTION_HEADING}>Boat Setup</h2>
          <BoatSetupFacts setup={race.boat_setup} />
          {/* The amendment sits directly under what it amends, so the pointers being changed are the
              ones just read. Absent for a viewer rather than present and refused (ADR 0019). */}
          {canWrite && (
            <RaceBoatSetupPanel
              raceId={race.id}
              setup={race.boat_setup}
              choices={boatSetupChoices}
              charts={charts}
              // What moving the chart Version costs, counted off the Testimony this page already read:
              // every Sail Configuration names a Definition of the old Version and none can travel.
              sailEntryCount={race.annotations.sails.length}
              amendBoatSetup={amendBoatSetup}
            />
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

        {canWrite && (
          <RaceDeletePanel
            raceId={race.id}
            filename={race.recording.filename}
            deleteRace={deleteRace}
          />
        )}
      </div>
    </div>
  )
}

/**
 * What the boat was, for the whole of this race: four Version pointers and the Wind Band.
 *
 * Every one of them is what the Race *holds*, resolved by id. Nothing here reads "the Polar in force
 * now", which is the point of storing pointers at all — a race sailed under Polar v2 says v2 forever,
 * including after v5 lands (ADR 0012).
 *
 * Each named Version links to the Version it names, so "Polar v2" is followed rather than trusted. The
 * Rig Tune page takes a Version *number* and the Instrument Calibration page has no per-Version route,
 * so those two links land where the reader can see the same Version stated.
 *
 * An unrecorded pointer reads as **not recorded**, in the same treatment the annotations use, because it
 * is the same fact: nobody wrote it down. It is the ordinary state of this archive's oldest races, which
 * predate every Boat Setup artifact the boat has, and nothing backdates v1 onto them (ADR 0008).
 */
function BoatSetupFacts({ setup }: { setup: RaceBoatSetup }): ReactElement {
  const nothingRecorded =
    setup.polar === null &&
    setup.crossover_chart === null &&
    setup.rig_tune === null &&
    setup.instrument_calibration === null &&
    setup.band === null

  if (nothingRecorded) {
    return (
      <NotRecorded>
        Not recorded — this race names no Polar, Crossover Chart, Rig Tune or Instrument Calibration
        Version, and no Wind Band.
      </NotRecorded>
    )
  }

  return (
    <dl
      data-testid="boat-setup-facts"
      style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: spacing(1) }}
    >
      <VersionFact
        label="Polar"
        version={setup.polar}
        href={(id) => `/boat-management/polar/${id}`}
      />
      <VersionFact
        label="Crossover Chart"
        version={setup.crossover_chart}
        href={(id) => `/boat-management/crossover-chart/${id}`}
      />
      <VersionFact
        label="Rig Tune"
        version={setup.rig_tune}
        // The Rig Tune page selects by Version number, not by id (`?version=2`).
        href={(_id, number) => `/boat-management/rig-tune?version=${number}`}
      />
      <BandFact band={setup.band} />
      <VersionFact
        label="Instrument Calibration"
        version={setup.instrument_calibration}
        // One page for the artifact, with the Version it is showing stated on it.
        href={() => '/boat-management/instrument-calibration'}
      />
    </dl>
  )
}

/** One Version pointer, as a link to the Version, or the words for a pointer nobody set. */
function VersionFact({
  label,
  version,
  href,
}: {
  label: string
  version: BoatSetupVersionRef | null
  href: (versionId: string, versionNumber: number) => string
}): ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: spacing(2) }}>
      <dt style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', flex: 1 }}>{label}</dt>
      <dd style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>
        {version === null ? (
          <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>Not recorded</span>
        ) : (
          <Link
            href={href(version.version_id, version.version_number)}
            style={{ color: 'var(--text-accent)' }}
          >
            {`v${version.version_number}`}
          </Link>
        )}
      </dd>
    </div>
  )
}

/**
 * The Wind Band the rig was set to, in the band's own words.
 *
 * Indented under the Rig Tune, because it is not a fifth pointer — it is one row of *that* Version's band
 * table, and it cannot be read without it (ADR 0007). There is no link of its own: a band has no page,
 * and the Rig Tune link above lands on the table this row is in.
 */
function BandFact({ band }: { band: WindBandRef | null }): ReactElement {
  return (
    <div
      style={{ display: 'flex', alignItems: 'baseline', gap: spacing(2), paddingLeft: spacing(3) }}
    >
      <dt style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', flex: 1 }}>Wind Band</dt>
      <dd
        style={{
          margin: 0,
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-sm)',
          color: 'var(--text-primary)',
        }}
      >
        {band === null ? (
          <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>Not recorded</span>
        ) : (
          bandText(band)
        )}
      </dd>
    </div>
  )
}

/** `8–12 kt` on its own, or `Medium · 8–12 kt` where the tuning guide gave the band a name. */
function bandText(band: WindBandRef): string {
  const range = formatBandRange(band.low_kt, band.high_kt)
  return band.label === null ? range : `${band.label} · ${range}`
}

/**
 * One Sail Configuration, in the words of the Crossover Chart Version the Race points at.
 *
 * The label arrives already resolved against *that* Version (ADR 0012, ADR 0023) — this page never
 * looks up a sail name, so it cannot accidentally rename a 2024 race in the current chart's words.
 *
 * A note-only entry reads as exactly what was written, with nothing beside it. The chart does not name
 * everything the boat has ever flown, and putting the nearest Definition's words on an entry that named
 * none would be Layline deciding what was up.
 */
function sailText(entry: RaceSailAnnotation): string {
  const note = noteText(entry.note)

  if (entry.label === null) return note
  return sailWithNote(entry.label, note)
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
