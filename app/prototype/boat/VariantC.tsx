'use client'

/**
 * PROTOTYPE — throwaway. See ./README.md.
 *
 * VARIANT C — "Ledger".
 *
 * The position: there is only one boat, and everything Layline knows about it
 * is a dated entry — a race, a new Version, a calibration act, a sail retired.
 * So there is one chronological record instead of two sections, and the
 * artifacts hang off its head. Its answers:
 *
 *   Q1  A race row opens a record sheet: two blocks, one for what we say
 *       happened and one for what the file says, with the seam between them the
 *       loudest thing on the screen. No map — a track with nothing to compare
 *       it to is decoration, but the rows themselves are not.
 *   Q2  Overall is a disabled skeleton of the real screen: the cards that will
 *       be there, greyed, each naming what it needs before it can fill.
 *   Q3  Artifacts render one wind speed at a time. No grid, no sideways scroll,
 *       no colour legend to decode.
 *   Q4  A Guest sees both entries; tapping either opens the Auth Sheet.
 *   Q6  Admin writes are a pencil per field, in place, wherever the field is
 *       read. The Transcription block has no pencils anywhere.
 *   Q7  Boat identity is the head of the ledger — the first dated fact.
 */

import React, { useMemo, useState } from 'react'
import {
  ARTIFACT_LABEL,
  BOAT,
  CALIBRATION_EVENTS,
  CALIBRATION_PAYLOADS,
  CROSSOVER_PAYLOADS,
  POLAR_PAYLOADS,
  RACES,
  RIG_BANDS,
  SAILS,
  SEA_STATE_LABEL,
  VERSIONS,
  clockOf,
  clockWithSecondsOf,
  currentVersionOf,
  dateOf,
  durationLabel,
  longDateOf,
  racesUsingSail,
  sailConfigLabel,
  versionById,
  versionsOf,
  type ArtifactKind,
  type Race,
} from './fixture'
import {
  DETECTOR_VERSION,
  analyseRace,
  archiveSummary,
  calibrationLog,
  checkWindow,
  isAnnotated,
  resolveSeaStateAt,
  seriesOf,
} from './derive'
import {
  CalibrationValues,
  CrossoverRuns,
  Label,
  Mono,
  NotRecorded,
  PolarByWind,
  ProvenanceSentence,
  QualityKey,
  RigTuneBands,
  RowTable,
  Seam,
  SpanList,
  TraceChart,
} from './primitives'
import { canWrite, isSignedIn, type Viewer } from './viewer'

type Screen = { name: 'ledger' } | { name: 'race'; id: string } | { name: 'overall' }

// ---------------------------------------------------------------------------
// The pencil. Variant C's whole answer to "where do admin writes go".
// ---------------------------------------------------------------------------

function EditableField({
  label,
  value,
  viewer,
  hint,
  monospace = false,
}: {
  label: string
  value: React.ReactNode
  viewer: Viewer
  hint?: string
  monospace?: boolean
}): React.ReactElement {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(typeof value === 'string' ? value : '')

  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid var(--surface-divider)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Label>{label}</Label>
          {editing ? (
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 'var(--input-radius)',
                border: '1px solid var(--input-focus-border)', background: 'var(--input-bg)',
                color: 'var(--input-fg)', fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-sm)',
              }}
            />
          ) : (
            <div
              style={{
                fontFamily: monospace ? 'var(--font-mono)' : 'var(--font-body)',
                fontSize: 'var(--text-base)', color: 'var(--text-primary)', lineHeight: 1.45,
              }}
            >
              {value}
            </div>
          )}
        </div>
        {canWrite(viewer) &&
          (editing ? (
            <div style={{ display: 'flex', gap: '4px', flex: '0 0 auto' }}>
              <button
                onClick={() => setEditing(false)}
                style={{
                  padding: '6px 10px', borderRadius: '6px', cursor: 'pointer',
                  border: 'none', background: 'var(--btn-primary-bg)',
                  color: 'var(--btn-primary-fg)', fontFamily: 'var(--font-body)',
                  fontSize: 'var(--text-xs)', fontWeight: 600,
                }}
              >
                Save
              </button>
              <button
                onClick={() => setEditing(false)}
                style={{
                  padding: '6px 8px', borderRadius: '6px', cursor: 'pointer',
                  border: '1px solid var(--surface-border)', background: 'transparent',
                  color: 'var(--text-muted)', fontFamily: 'var(--font-body)',
                  fontSize: 'var(--text-xs)',
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditing(true)}
              aria-label={`Edit ${label}`}
              style={{
                flex: '0 0 auto', padding: '6px', borderRadius: '6px', cursor: 'pointer',
                border: '1px solid var(--surface-border)', background: 'var(--surface-raised)',
                color: 'var(--text-muted)', display: 'flex',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
          ))}
      </div>
      {hint && (
        <p
          style={{
            margin: '4px 0 0', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
            color: 'var(--text-muted)', lineHeight: 1.4,
          }}
        >
          {hint}
        </p>
      )}
    </div>
  )
}

function AuthSheet({ onClose }: { onClose: () => void }): React.ReactElement {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'flex-end',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', background: 'var(--surface-raised)', borderTopLeftRadius: '14px',
          borderTopRightRadius: '14px', padding: '20px 16px 32px',
          borderTop: '1px solid var(--surface-border)',
        }}
      >
        <h2
          style={{
            margin: '0 0 6px', fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)',
            fontWeight: 700, color: 'var(--text-primary)',
          }}
        >
          Sign in to read the boat
        </h2>
        <p
          style={{
            margin: '0 0 16px', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
            color: 'var(--text-secondary)', lineHeight: 1.5,
          }}
        >
          The record, the races and the setup are for people with an account.
          Wind and forecast need no account and never will.
        </p>
        <button
          onClick={onClose}
          style={{
            width: '100%', padding: '12px', borderRadius: 'var(--btn-primary-radius)',
            border: 'none', cursor: 'pointer', background: 'var(--btn-primary-bg)',
            color: 'var(--btn-primary-fg)', fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-base)', fontWeight: 600,
          }}
        >
          Continue with email
        </button>
        <button
          onClick={onClose}
          style={{
            width: '100%', marginTop: '8px', padding: '10px', background: 'transparent',
            border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
            fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
          }}
        >
          Not now
        </button>
      </div>
    </div>
  )
}

/** Variant C's drawer: the entries are always there, and always tappable. */
function DrawerPreview({
  viewer,
  screen,
  onGo,
  onBlocked,
}: {
  viewer: Viewer
  screen: Screen
  onGo: (s: Screen) => void
  onBlocked: () => void
}): React.ReactElement {
  const items: { label: string; screen: Screen }[] = [
    { label: 'Boat record', screen: { name: 'ledger' } },
    { label: 'Boat performance', screen: { name: 'overall' } },
  ]
  return (
    <div
      style={{
        border: '1px solid var(--surface-border)', borderRadius: '8px',
        background: 'var(--surface-raised)', padding: '10px', marginBottom: '16px',
      }}
    >
      <Label>Drawer · {isSignedIn(viewer) ? 'signed in' : 'guest'}</Label>
      {['Dashboard', 'Wind Data', 'Settings'].map((label) => (
        <div
          key={label}
          style={{
            padding: '9px 8px', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
            color: 'var(--text-secondary)',
          }}
        >
          {label}
        </div>
      ))}
      {items.map((item) => {
        const active =
          isSignedIn(viewer) &&
          ((item.screen.name === 'overall' && screen.name === 'overall') ||
            (item.screen.name === 'ledger' && screen.name !== 'overall'))
        return (
          <button
            key={item.label}
            onClick={() => (isSignedIn(viewer) ? onGo(item.screen) : onBlocked())}
            style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '9px 8px',
              borderRadius: '6px', cursor: 'pointer', border: '1px solid transparent',
              background: active ? 'var(--blue-muted)' : 'transparent',
              color: active ? 'var(--text-accent)' : 'var(--text-secondary)',
              fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
              fontWeight: active ? 600 : 500,
            }}
          >
            {item.label}
          </button>
        )
      })}
      {!isSignedIn(viewer) && (
        <p
          style={{
            margin: '6px 8px 2px', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
            color: 'var(--text-muted)', lineHeight: 1.45,
          }}
        >
          No padlocks, no greying out. The entries behave like entries and the
          Auth Sheet answers when you tap one.
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// The ledger
// ---------------------------------------------------------------------------

type Entry =
  | { kind: 'race'; at: string; race: Race }
  | { kind: 'version'; at: string; artifact: ArtifactKind; versionNumber: number; note: string | null }
  | { kind: 'event'; at: string; text: string; note: string }
  | { kind: 'sail'; at: string; text: string }
  | { kind: 'boat'; at: string }

function buildLedger(): Entry[] {
  const entries: Entry[] = []

  RACES.forEach((race) => entries.push({ kind: 'race', at: race.windowStart, race }))

  VERSIONS.forEach((version) =>
    entries.push({
      kind: 'version',
      at: `${version.effectiveFrom}T00:00:00`,
      artifact: version.kind,
      versionNumber: version.versionNumber,
      note: version.note,
    })
  )

  CALIBRATION_EVENTS.forEach((event) =>
    entries.push({
      kind: 'event',
      at: `${event.occurredOn}T00:00:01`,
      text: `${event.type} on ${event.channels.join(', ')}`,
      note: event.note,
    })
  )

  SAILS.filter((sail) => sail.retiredOn !== null).forEach((sail) =>
    entries.push({
      kind: 'sail',
      at: `${sail.retiredOn as string}T00:00:00`,
      text: `${sail.label} retired — named in ${racesUsingSail(sail.key).length} races, all of which still read it`,
    })
  )

  entries.push({ kind: 'boat', at: '2026-05-01T00:00:00' })

  return entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
}

const KIND_COLOR: Record<Entry['kind'], string> = {
  race: 'var(--blue-500)',
  version: 'var(--wind-light)',
  event: 'var(--wind-heavy)',
  sail: 'var(--text-muted)',
  boat: 'var(--text-secondary)',
}

const KIND_LABEL: Record<Entry['kind'], string> = {
  race: 'Race',
  version: 'New Version',
  event: 'Calibration Event',
  sail: 'Sail Inventory',
  boat: 'Boat',
}

function Ledger({
  viewer,
  onGo,
}: {
  viewer: Viewer
  onGo: (s: Screen) => void
}): React.ReactElement {
  const entries = useMemo(() => buildLedger(), [])
  const [openArtifact, setOpenArtifact] = useState<ArtifactKind | null>(null)
  const log = useMemo(() => calibrationLog(), [])

  return (
    <>
      <div style={{ marginBottom: '16px' }}>
        <h1
          style={{
            margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)',
            fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)',
          }}
        >
          {BOAT.name}
        </h1>
        <EditableField
          label="Boat"
          value={`${BOAT.name} · ${BOAT.model}`}
          viewer={viewer}
          hint="Identity lives at the head of the record, not in Settings: it is the first dated fact about the boat, and everything below it is the rest."
        />
      </div>

      <Label>Set to, today</Label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
        {(['polar', 'crossover_chart', 'rig_tune', 'instrument_calibration'] as ArtifactKind[]).map(
          (kind) => {
            const current = currentVersionOf(kind)
            const open = openArtifact === kind
            return (
              <button
                key={kind}
                onClick={() => setOpenArtifact(open ? null : kind)}
                style={{
                  padding: '7px 11px', borderRadius: '999px', cursor: 'pointer',
                  fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                  border: open ? '1.5px solid var(--blue-500)' : '1px solid var(--surface-border)',
                  background: open ? 'var(--blue-muted)' : 'var(--surface-raised)',
                  color: open ? 'var(--text-accent)' : 'var(--text-secondary)',
                }}
              >
                {ARTIFACT_LABEL[kind]}{' '}
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                  v{current.versionNumber}
                </span>
              </button>
            )
          }
        )}
      </div>

      {openArtifact !== null && (
        <div
          style={{
            border: '1px solid var(--surface-border)', borderRadius: '10px', padding: '14px',
            background: 'var(--surface-elevated)', marginBottom: '20px',
          }}
        >
          <div
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              marginBottom: '12px',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-display)', fontSize: 'var(--text-base)', fontWeight: 700,
                color: 'var(--text-primary)',
              }}
            >
              {ARTIFACT_LABEL[openArtifact]}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
                color: 'var(--text-muted)',
              }}
            >
              {versionsOf(openArtifact).length} versions in the record
            </span>
          </div>

          {openArtifact === 'polar' && (
            <PolarByWind payload={POLAR_PAYLOADS[currentVersionOf('polar').id]} />
          )}
          {openArtifact === 'crossover_chart' && (
            <CrossoverRuns payload={CROSSOVER_PAYLOADS[currentVersionOf('crossover_chart').id]} />
          )}
          {openArtifact === 'rig_tune' && <RigTuneBands bands={RIG_BANDS} />}
          {openArtifact === 'instrument_calibration' && (
            <>
              <CalibrationValues
                payload={CALIBRATION_PAYLOADS[currentVersionOf('instrument_calibration').id]}
              />
              <p
                style={{
                  margin: '12px 0 0', fontFamily: 'var(--font-body)',
                  fontSize: 'var(--text-sm)', color: 'var(--text-muted)', lineHeight: 1.45,
                }}
              >
                Every change and every calibration act is already in the record
                below — {log.length} entries. There is no second history screen,
                because there is no second history.
              </p>
              {canWrite(viewer) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                  <button
                    onClick={() => undefined}
                    style={{
                      padding: '10px 12px', borderRadius: '6px', cursor: 'pointer',
                      textAlign: 'left', border: '1px solid var(--surface-border-hover)',
                      background: 'var(--surface-raised)', color: 'var(--text-primary)',
                      fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600,
                    }}
                  >
                    Add entry · new programmed values
                  </button>
                  <button
                    onClick={() => undefined}
                    style={{
                      padding: '10px 12px', borderRadius: '6px', cursor: 'pointer',
                      textAlign: 'left', border: '1px solid var(--surface-border-hover)',
                      background: 'var(--surface-raised)', color: 'var(--wind-heavy)',
                      fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600,
                    }}
                  >
                    Add entry · a calibration was performed, no values
                  </button>
                  <p
                    style={{
                      margin: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                      color: 'var(--text-muted)', lineHeight: 1.45,
                    }}
                  >
                    Both are &ldquo;add an entry to the record&rdquo;. The
                    difference is whether there are numbers to type, and the
                    second button says so in its own label rather than in a help
                    icon.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <Label>The record</Label>
      <div style={{ position: 'relative', paddingLeft: '14px' }}>
        <div
          style={{
            position: 'absolute', left: '3px', top: '6px', bottom: '6px', width: '1px',
            background: 'var(--surface-divider)',
          }}
        />
        {entries.map((entry, i) => (
          <div key={`${entry.kind}-${entry.at}-${i}`} style={{ position: 'relative', padding: '11px 0' }}>
            <span
              style={{
                position: 'absolute', left: '-14px', top: '17px', width: '7px', height: '7px',
                borderRadius: '50%', background: KIND_COLOR[entry.kind],
              }}
            />
            <div
              style={{
                display: 'flex', alignItems: 'baseline', gap: '8px',
                fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
                color: 'var(--text-muted)',
              }}
            >
              <span>{longDateOf(entry.at)}</span>
              <span style={{ color: KIND_COLOR[entry.kind] }}>{KIND_LABEL[entry.kind]}</span>
            </div>

            {entry.kind === 'race' ? (
              <button
                onClick={() => onGo({ name: 'race', id: entry.race.id })}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '4px 0 0',
                  background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit',
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--font-body)', fontSize: 'var(--text-base)',
                    fontWeight: 600, color: 'var(--text-primary)',
                  }}
                >
                  {entry.race.title ?? (
                    <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>
                      {clockOf(entry.race.windowStart)}–{clockOf(entry.race.windowFinish)}
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                    color: 'var(--text-muted)',
                  }}
                >
                  {entry.race.title !== null &&
                    `${clockOf(entry.race.windowStart)}–${clockOf(entry.race.windowFinish)} · `}
                  {isAnnotated(entry.race)
                    ? `${entry.race.sailEntries.length} sail ${
                        entry.race.sailEntries.length === 1 ? 'entry' : 'entries'
                      }`
                    : 'nothing remembered'}
                  {' · read the sheet ›'}
                </div>
              </button>
            ) : (
              <div style={{ paddingTop: '3px' }}>
                <div
                  style={{
                    fontFamily: 'var(--font-body)', fontSize: 'var(--text-base)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {entry.kind === 'version' &&
                    `${ARTIFACT_LABEL[entry.artifact]} v${entry.versionNumber} takes effect`}
                  {entry.kind === 'event' && entry.text}
                  {entry.kind === 'sail' && entry.text}
                  {entry.kind === 'boat' && `${BOAT.name} enters the record`}
                </div>
                {entry.kind === 'version' && entry.note && (
                  <p
                    style={{
                      margin: '3px 0 0', fontFamily: 'var(--font-body)',
                      fontSize: 'var(--text-sm)', color: 'var(--text-muted)', lineHeight: 1.45,
                    }}
                  >
                    {entry.note}
                  </p>
                )}
                {entry.kind === 'event' && (
                  <p
                    style={{
                      margin: '3px 0 0', fontFamily: 'var(--font-body)',
                      fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.45,
                    }}
                  >
                    {entry.note} <em style={{ color: 'var(--text-muted)' }}>No values changed.</em>
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {canWrite(viewer) && (
        <div
          style={{
            position: 'sticky', bottom: '84px', marginTop: '20px', display: 'flex', gap: '8px',
            flexWrap: 'wrap',
          }}
        >
          <button
            onClick={() => undefined}
            style={{
              flex: 1, padding: '12px', borderRadius: 'var(--btn-primary-radius)', border: 'none',
              cursor: 'pointer', background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-fg)',
              fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 700,
            }}
          >
            + Add to the record
          </button>
        </div>
      )}
      {canWrite(viewer) && (
        <p
          style={{
            margin: '8px 0 0', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
            color: 'var(--text-muted)', lineHeight: 1.45,
          }}
        >
          One write entry point: upload a recording, mark a race, log a
          calibration, retire a sail, or set new values — all of them are
          &ldquo;something happened on a date&rdquo;. Everything else is a pencil
          next to the thing it edits.
        </p>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// The record sheet
// ---------------------------------------------------------------------------

function RecordSheet({
  race,
  viewer,
  onGo,
}: {
  race: Race
  viewer: Viewer
  onGo: (s: Screen) => void
}): React.ReactElement {
  const analysis = useMemo(() => analyseRace(race), [race])
  const sog = useMemo(() => seriesOf(analysis.windowRows, analysis.windowQuality, 'sog'), [analysis])
  const seaState = resolveSeaStateAt(race, race.windowStart)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const refusal = checkWindow(race.recordingId, race.windowStart, race.windowFinish)

  return (
    <>
      <button
        onClick={() => onGo({ name: 'ledger' })}
        style={{
          background: 'transparent', border: 'none', padding: 0, marginBottom: '10px',
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
          color: 'var(--text-accent)', cursor: 'pointer',
        }}
      >
        ← The record
      </button>

      <div
        style={{
          fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)',
          color: 'var(--text-muted)',
        }}
      >
        {longDateOf(race.windowStart)}
        {dateOf(race.windowFinish) !== dateOf(race.windowStart) &&
          ` → ${longDateOf(race.windowFinish)}`}
      </div>

      <div
        style={{
          border: '1px solid var(--surface-border)', borderRadius: '10px', padding: '14px',
          background: 'var(--surface-raised)', marginTop: '10px',
        }}
      >
        <Label>What we say happened</Label>
        <p
          style={{
            margin: '0 0 8px', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
            color: 'var(--text-muted)', lineHeight: 1.45,
          }}
        >
          Typed in from memory. Every line has a pencil for an admin, and no line
          keeps a history of its corrections.
        </p>

        <EditableField
          label="Title"
          value={race.title ?? <NotRecorded label="No title" />}
          viewer={viewer}
          hint={race.title === null ? 'Optional, and never generated.' : undefined}
        />
        <EditableField
          label="Race Window start"
          value={clockWithSecondsOf(race.windowStart)}
          viewer={viewer}
          monospace
        />
        <EditableField
          label="Race Window finish"
          value={clockWithSecondsOf(race.windowFinish)}
          viewer={viewer}
          monospace
          hint={`${durationLabel(analysis.windowMinutes)} long. A finish at or before the start, or a window with no rows in it, is refused — the same check the upload runs. This window ${
            refusal.ok ? 'passes' : 'fails'
          }.`}
        />

        <div style={{ padding: '10px 0', borderBottom: '1px solid var(--surface-divider)' }}>
          <Label>Sails</Label>
          {race.sailEntries.length === 0 ? (
            <NotRecorded />
          ) : (
            race.sailEntries.map((entry) => (
              <div
                key={entry.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '3px 0',
                }}
              >
                <Mono>{clockOf(entry.at)}</Mono>
                <span
                  style={{
                    flex: 1, fontFamily: 'var(--font-body)', fontSize: 'var(--text-base)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {sailConfigLabel(entry)}
                </span>
                {canWrite(viewer) && (
                  <>
                    <button
                      onClick={() => undefined}
                      aria-label="Edit annotation"
                      style={{
                        padding: '4px 8px', borderRadius: '5px', cursor: 'pointer',
                        border: '1px solid var(--surface-border)', background: 'transparent',
                        color: 'var(--text-muted)', fontFamily: 'var(--font-body)',
                        fontSize: 'var(--text-xs)',
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => undefined}
                      aria-label="Delete annotation"
                      style={{
                        padding: '4px 8px', borderRadius: '5px', cursor: 'pointer',
                        border: '1px solid var(--surface-border)', background: 'transparent',
                        color: 'var(--state-danger)', fontFamily: 'var(--font-body)',
                        fontSize: 'var(--text-xs)',
                      }}
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            ))
          )}
          {canWrite(viewer) && (
            <button
              onClick={() => undefined}
              style={{
                marginTop: '6px', background: 'transparent', border: 'none', padding: 0,
                fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                color: 'var(--text-accent)', cursor: 'pointer',
              }}
            >
              + Add a sail change
            </button>
          )}
        </div>

        <EditableField
          label="Sea State"
          value={seaState === null ? <NotRecorded /> : SEA_STATE_LABEL[seaState.seaState]}
          viewer={viewer}
        />
        <EditableField
          label="Wind Band as recorded"
          value={<NotRecorded />}
          viewer={viewer}
          hint="Nobody wrote one down for this race. That is a fact about the record, not a gap to fill with a guess."
        />

        <Label>Setup in force</Label>
        {(
          [
            ['Polar', race.polarVersionId],
            ['Crossover Chart', race.crossoverVersionId],
            ['Rig Tune', race.rigTuneVersionId],
            ['Instrument Calibration', race.calibrationVersionId],
          ] as const
        ).map(([label, id]) => (
          <EditableField
            key={label}
            label={label}
            value={
              versionById(id) ? (
                `v${versionById(id)?.versionNumber} · effective ${longDateOf(
                  versionById(id)?.effectiveFrom as string
                )}`
              ) : (
                <NotRecorded />
              )
            }
            viewer={viewer}
            hint={
              id === null && label === 'Rig Tune'
                ? 'No race in the archive has one. The first measured tune post-dates every race here, and pretending otherwise would be inventing a measurement.'
                : undefined
            }
          />
        ))}
      </div>

      <div
        style={{
          margin: '18px 0', display: 'flex', alignItems: 'center', gap: '10px',
        }}
      >
        <div style={{ flex: 1, height: '1px', background: 'var(--surface-border-hover)' }} />
        <span
          style={{
            fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', letterSpacing: '0.1em',
            textTransform: 'uppercase', color: 'var(--text-muted)',
          }}
        >
          no pencils past this line
        </span>
        <div style={{ flex: 1, height: '1px', background: 'var(--surface-border-hover)' }} />
      </div>

      <div
        style={{
          border: '1px solid var(--surface-border)', borderRadius: '10px', padding: '14px',
          background: 'var(--surface-base)',
        }}
      >
        <Label>What the file says</Label>
        <p
          style={{
            margin: '0 0 10px', fontFamily: 'var(--font-body)', fontSize: 'var(--text-base)',
            color: 'var(--text-primary)', lineHeight: 1.5,
          }}
        >
          {analysis.coverageSentence}
        </p>
        <QualityKey counts={analysis.counts} />
        {analysis.frozenSpans.length > 0 && (
          <div style={{ marginTop: '8px' }}>
            <SpanList spans={analysis.frozenSpans} kind="Frozen" />
          </div>
        )}
        {analysis.notWaterReferencedSpans.length > 0 && (
          <div style={{ marginTop: '4px' }}>
            <SpanList spans={analysis.notWaterReferencedSpans} kind="No paddlewheel" />
          </div>
        )}

        <div style={{ marginTop: '14px' }}>
          <Label>Speed over the ground · frozen spans drawn as breaks</Label>
          <TraceChart series={sog} unit="kt" />
        </div>

        <div style={{ marginTop: '14px' }}>
          <RowTable rows={analysis.windowRows} quality={analysis.windowQuality} limit={8} />
        </div>

        <div style={{ marginTop: '14px' }}>
          <ProvenanceSentence text={analysis.provenanceSentence} />
        </div>

        <div
          style={{
            marginTop: '10px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
          }}
        >
          {DETECTOR_VERSION} · derived at read · {analysis.allRows.length} rows in the file
        </div>
      </div>

      <div style={{ marginTop: '18px' }}>
        <Seam>
          The sheet ends here. What is missing is the comparison — this race
          against the polar, against the chart, against the other thirteen. When
          that exists it becomes a third block, below this one, and the two
          blocks above it do not change.
        </Seam>
      </div>

      {canWrite(viewer) && (
        <div style={{ marginTop: '18px' }}>
          <button
            onClick={() => setConfirmDelete(!confirmDelete)}
            style={{
              width: '100%', padding: '11px', borderRadius: '6px', cursor: 'pointer',
              border: '1px solid var(--state-danger)', background: 'transparent',
              color: 'var(--state-danger)', fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-sm)', fontWeight: 600,
            }}
          >
            {confirmDelete ? 'Confirm — delete this race and its file' : 'Delete this race'}
          </button>
          {confirmDelete && (
            <p
              style={{
                margin: '8px 0 0', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                color: 'var(--state-danger)', lineHeight: 1.45,
              }}
            >
              The annotations, the Transcription and the stored bytes go together.
              Nothing is recoverable. Two taps, the same shape as confirming an
              upload.
            </p>
          )}
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Overall — the real screen, disabled
// ---------------------------------------------------------------------------

function OverallSkeleton({ onGo }: { onGo: (s: Screen) => void }): React.ReactElement {
  const summary = useMemo(() => archiveSummary(), [])

  const cards: { title: string; needs: string; bars: number[] }[] = [
    {
      title: 'Speed against target',
      needs: 'A Polar measured on this boat. The one in the record is off a certificate.',
      bars: [0.8, 0.62, 0.9, 0.55, 0.72],
    },
    {
      title: 'Sail choice vs the Crossover Chart',
      needs: `Wind we trust. Every wind figure in the ${summary.rowsInWindows.toLocaleString('en-US')} raced rows was computed upstream from settings the file does not record.`,
      bars: [0.4, 0.85, 0.3, 0.6],
    },
    {
      title: 'Manoeuvre cost',
      needs: 'A tack detector. The rows are there; nothing reads them yet.',
      bars: [0.55, 0.7, 0.45, 0.8, 0.35, 0.6],
    },
    {
      title: 'Tune vs conditions',
      needs: `A Rig Tune pointer on a race. ${summary.racesMissingRigTune} of ${summary.raceCount} have none.`,
      bars: [0.5, 0.5, 0.5],
    },
  ]

  return (
    <>
      <button
        onClick={() => onGo({ name: 'ledger' })}
        style={{
          background: 'transparent', border: 'none', padding: 0, marginBottom: '10px',
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
          color: 'var(--text-accent)', cursor: 'pointer',
        }}
      >
        ← The record
      </button>

      <h1
        style={{
          margin: '0 0 4px', fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)',
          fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em',
        }}
      >
        Overall
      </h1>
      <p
        style={{
          margin: '0 0 16px', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
          color: 'var(--text-secondary)', lineHeight: 1.5,
        }}
      >
        This is the screen, switched off. Four cards, in the places they will
        occupy, each saying what it is waiting for. Nothing below is data —
        the bars are drawn from nothing.
      </p>

      {cards.map((card) => (
        <div
          key={card.title}
          style={{
            border: '1px dashed var(--surface-border-hover)', borderRadius: 'var(--card-radius)',
            padding: '14px', marginBottom: '12px', background: 'var(--surface-base)',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-display)', fontSize: 'var(--text-base)', fontWeight: 700,
              color: 'var(--text-muted)', marginBottom: '10px',
            }}
          >
            {card.title}
          </div>
          <div
            style={{
              display: 'flex', alignItems: 'flex-end', gap: '6px', height: '46px',
              marginBottom: '10px', opacity: 0.35,
            }}
            aria-hidden="true"
          >
            {card.bars.map((b, i) => (
              <div
                key={i}
                style={{
                  flex: 1, height: `${b * 100}%`, borderRadius: '2px',
                  background:
                    'repeating-linear-gradient(135deg, var(--surface-elevated) 0 4px, transparent 4px 8px)',
                  border: '1px solid var(--surface-border)',
                }}
              />
            ))}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
              color: 'var(--text-secondary)', lineHeight: 1.45,
            }}
          >
            <strong style={{ color: 'var(--text-primary)' }}>Waiting on:</strong> {card.needs}
          </div>
        </div>
      ))}

      <Seam>
        Variant C&rsquo;s bet is that a switched-off screen reads as{' '}
        <em>not yet</em> more clearly than an empty one, because you can see the
        shape of what is coming and why it is not here. The risk is the opposite
        reading — that it looks broken, or worse, that somebody mistakes the
        hatched bars for data.
      </Seam>

      <p
        style={{
          margin: '16px 0 0', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
          color: 'var(--text-muted)', lineHeight: 1.5,
        }}
      >
        {summary.raceCount} races and {durationLabel(summary.totalRacedMinutes)} of racing are
        in the record, waiting. That count is the only real number on this
        screen, and it sits in a sentence rather than in a card.
      </p>
    </>
  )
}

// ---------------------------------------------------------------------------

export default function VariantC({ viewer }: { viewer: Viewer }): React.ReactElement {
  const [screen, setScreen] = useState<Screen>({ name: 'ledger' })
  const [auth, setAuth] = useState(false)

  const race =
    screen.name === 'race' ? RACES.find((r) => r.id === screen.id) : undefined

  return (
    <div style={{ padding: '20px 16px 130px' }}>
      <DrawerPreview
        viewer={viewer}
        screen={screen}
        onGo={setScreen}
        onBlocked={() => setAuth(true)}
      />

      {!isSignedIn(viewer) ? (
        <>
          <h1
            style={{
              margin: '0 0 6px', fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)',
              fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em',
            }}
          >
            Dashboard
          </h1>
          <p
            style={{
              margin: '0 0 16px', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
              color: 'var(--text-muted)', lineHeight: 1.5,
            }}
          >
            Wind and forecast, signed out, exactly as today.
          </p>
          <Seam>
            Tap either boat entry in the drawer above. Variant C answers a Guest
            with the Auth Sheet: the entries are not decorated with padlocks and
            are not hidden, and the app never pretends the sections do not
            exist. The cost is a sheet you can summon and dismiss forever
            without learning what is behind it.
          </Seam>
          {auth && <AuthSheet onClose={() => setAuth(false)} />}
        </>
      ) : (
        <>
          {screen.name === 'ledger' && <Ledger viewer={viewer} onGo={setScreen} />}
          {screen.name === 'race' && race && (
            <RecordSheet race={race} viewer={viewer} onGo={setScreen} />
          )}
          {screen.name === 'overall' && <OverallSkeleton onGo={setScreen} />}
        </>
      )}
    </div>
  )
}
