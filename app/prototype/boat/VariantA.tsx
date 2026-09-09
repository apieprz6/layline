'use client'

/**
 * PROTOTYPE — throwaway. See ./README.md.
 *
 * VARIANT A — "Index".
 *
 * The position: until an analysis engine exists, the boat sections are an
 * index. Everything is a list, nothing is a dashboard, and the missing engine
 * is a visible seam rather than a gap you have to notice. Its answers:
 *
 *   Q1  A race row IS worth tapping, but the detail screen is deliberately
 *       minimal — Testimony, coverage, and the raw rows behind a toggle. No
 *       map, no traces, because a chart with nothing to compare against is a
 *       decoration.
 *   Q2  Overall is an empty state that names what will land there.
 *   Q3  Artifacts render as the full grid, scrolled sideways, numbers legible.
 *   Q4  A Guest sees nothing. No entries, no padlocks, no invitation.
 *   Q6  Admin writes are collected in one labelled block at the foot of each
 *       screen, and the block is simply absent for everyone else.
 *   Q7  Boat identity lives in Settings; Boat management is only the Setup.
 */

import React, { useMemo, useState } from 'react'
import {
  ARTIFACT_LABEL,
  BOAT,
  CALIBRATION_PAYLOADS,
  CROSSOVER_PAYLOADS,
  POLAR_PAYLOADS,
  RACES,
  RIG_BANDS,
  SAILS,
  SEA_STATE_LABEL,
  clockOf,
  clockWithSecondsOf,
  currentVersionOf,
  durationLabel,
  longDateOf,
  racesByDateDesc,
  racesUsingSail,
  sailConfigLabel,
  shortDateOf,
  versionById,
  versionsOf,
  type ArtifactKind,
  type Race,
} from './fixture'
import {
  DETECTOR_VERSION,
  analyseRace,
  calibrationLog,
  changeLabel,
  checkWindow,
  isAnnotated,
  resolveSeaStateAt,
} from './derive'
import {
  CalibrationValues,
  CrossoverMatrix,
  Label,
  Mono,
  NotRecorded,
  PolarTable,
  ProvenanceSentence,
  QualityKey,
  RigTuneBands,
  RowTable,
  Seam,
  SpanList,
} from './primitives'
import { canWrite, isSignedIn, type Viewer } from './viewer'

type Screen =
  | { name: 'management' }
  | { name: 'artifact'; kind: ArtifactKind }
  | { name: 'sails' }
  | { name: 'performance'; tab: 'races' | 'overall' }
  | { name: 'race'; id: string }
  | { name: 'amend'; id: string }

const ARTIFACTS: ArtifactKind[] = ['polar', 'crossover_chart', 'rig_tune', 'instrument_calibration']

// ---------------------------------------------------------------------------
// Chrome local to this variant
// ---------------------------------------------------------------------------

function Head({
  title,
  sub,
  onBack,
}: {
  title: string
  sub?: string
  onBack?: () => void
}): React.ReactElement {
  return (
    <div style={{ marginBottom: '18px' }}>
      {onBack && (
        <button
          onClick={onBack}
          style={{
            background: 'transparent', border: 'none', padding: 0, marginBottom: '8px',
            fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
            color: 'var(--text-accent)', cursor: 'pointer',
          }}
        >
          ← Back
        </button>
      )}
      <h1
        style={{
          margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)',
          fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)',
        }}
      >
        {title}
      </h1>
      {sub && (
        <p
          style={{
            margin: '4px 0 0', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
            color: 'var(--text-muted)',
          }}
        >
          {sub}
        </p>
      )}
    </div>
  )
}

function ListRow({
  onClick,
  children,
}: {
  onClick?: () => void
  children: React.ReactNode
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      disabled={onClick === undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
        textAlign: 'left', padding: '13px 4px', background: 'transparent',
        border: 'none', borderBottom: '1px solid var(--surface-divider)',
        cursor: onClick ? 'pointer' : 'default', color: 'inherit',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      {onClick && (
        <span style={{ color: 'var(--text-muted)', fontSize: '16px', flex: '0 0 auto' }}>›</span>
      )}
    </button>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <section style={{ marginTop: '26px' }}>
      <Label>{title}</Label>
      {children}
    </section>
  )
}

/** Every write in Variant A lives in one of these, or nowhere. */
function AdminBlock({
  viewer,
  actions,
  note,
}: {
  viewer: Viewer
  actions: { label: string; hint?: string; danger?: boolean; onClick: () => void }[]
  note?: string
}): React.ReactElement {
  if (!canWrite(viewer)) return <></>
  return (
    <section
      style={{
        marginTop: '28px', padding: '14px', borderRadius: '8px',
        border: '1px solid var(--surface-border)', background: 'var(--surface-elevated)',
      }}
    >
      <Label>Admin only</Label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {actions.map((action) => (
          <div key={action.label}>
            <button
              onClick={action.onClick}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: '6px', cursor: 'pointer',
                fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600,
                textAlign: 'left',
                border: `1px solid ${action.danger ? 'var(--state-danger)' : 'var(--surface-border-hover)'}`,
                background: 'var(--surface-raised)',
                color: action.danger ? 'var(--state-danger)' : 'var(--text-primary)',
              }}
            >
              {action.label}
            </button>
            {action.hint && (
              <p
                style={{
                  margin: '5px 2px 0', fontFamily: 'var(--font-body)',
                  fontSize: 'var(--text-sm)', color: 'var(--text-muted)', lineHeight: 1.45,
                }}
              >
                {action.hint}
              </p>
            )}
          </div>
        ))}
      </div>
      {note && (
        <p
          style={{
            margin: '12px 0 0', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
            color: 'var(--text-muted)', lineHeight: 1.45,
          }}
        >
          {note}
        </p>
      )}
    </section>
  )
}

/**
 * Variant A's drawer: for a Guest the two entries are not rendered at all, so
 * signed out there is no evidence the boat sections exist.
 */
function DrawerPreview({
  viewer,
  screen,
  onGo,
}: {
  viewer: Viewer
  screen: Screen
  onGo: (screen: Screen) => void
}): React.ReactElement {
  const base = ['Dashboard', 'Wind Data', 'Settings']
  const boat: { label: string; screen: Screen }[] = isSignedIn(viewer)
    ? [
        { label: 'Boat management', screen: { name: 'management' } },
        { label: 'Boat performance', screen: { name: 'performance', tab: 'races' } },
      ]
    : []

  return (
    <div
      style={{
        border: '1px solid var(--surface-border)', borderRadius: '8px',
        background: 'var(--surface-raised)', padding: '10px', marginBottom: '20px',
      }}
    >
      <Label>Drawer · {isSignedIn(viewer) ? 'signed in' : 'guest'}</Label>
      {base.map((label) => (
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
      {boat.map((item) => {
        const inPerformance =
          screen.name === 'performance' || screen.name === 'race' || screen.name === 'amend'
        const active =
          item.screen.name === 'performance' ? inPerformance : !inPerformance
        return (
          <button
            key={item.label}
            onClick={() => onGo(item.screen)}
            style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '9px 8px',
              borderRadius: '6px', cursor: 'pointer',
              border: '1px solid transparent',
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
          Nothing is hidden here, because nothing is here. Variant A does not
          advertise the boat sections to a Guest at all.
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

function Management({
  viewer,
  onGo,
}: {
  viewer: Viewer
  onGo: (screen: Screen) => void
}): React.ReactElement {
  return (
    <>
      <Head title="Boat management" sub="Four artifacts and the sail locker. Nothing else." />

      <Section title="Boat Setup">
        {ARTIFACTS.map((kind) => {
          const current = currentVersionOf(kind)
          return (
            <ListRow key={kind} onClick={() => onGo({ name: 'artifact', kind })}>
              <div
                style={{
                  fontFamily: 'var(--font-body)', fontSize: 'var(--text-base)',
                  fontWeight: 600, color: 'var(--text-primary)',
                }}
              >
                {ARTIFACT_LABEL[kind]}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                  color: 'var(--text-muted)',
                }}
              >
                v{current.versionNumber} · effective {longDateOf(current.effectiveFrom)}
                {versionsOf(kind).length > 1 ? ` · ${versionsOf(kind).length} versions` : ''}
              </div>
            </ListRow>
          )
        })}
      </Section>

      <Section title="Sail Inventory">
        <ListRow onClick={() => onGo({ name: 'sails' })}>
          <div
            style={{
              fontFamily: 'var(--font-body)', fontSize: 'var(--text-base)',
              fontWeight: 600, color: 'var(--text-primary)',
            }}
          >
            {SAILS.filter((s) => s.retiredOn === null).length} sails on the boat
          </div>
          <div
            style={{
              fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
              color: 'var(--text-muted)',
            }}
          >
            {SAILS.filter((s) => s.retiredOn !== null).length} retired · unversioned
          </div>
        </ListRow>
      </Section>

      <Section title="This boat">
        <p
          style={{
            margin: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
            color: 'var(--text-secondary)', lineHeight: 1.5,
          }}
        >
          <strong>{BOAT.name}</strong>, {BOAT.model}. Name and model are edited in{' '}
          <em>Settings</em>, not here — Variant A keeps Boat management to the
          things that have Versions, so &ldquo;boat identity&rdquo; never looks
          like something you can amend a race with.
        </p>
      </Section>

      <AdminBlock
        viewer={viewer}
        actions={[
          {
            label: 'Upload a new artifact version',
            hint: 'Pick the artifact, attach the file or type the values, set the date it took effect. Old versions are never replaced.',
            onClick: () => undefined,
          },
        ]}
      />
    </>
  )
}

function Sails({ viewer, onGo }: { viewer: Viewer; onGo: (s: Screen) => void }): React.ReactElement {
  return (
    <>
      <Head title="Sail Inventory" sub="A property of the boat, not a Version." onBack={() => onGo({ name: 'management' })} />
      {SAILS.map((sail) => {
        const races = racesUsingSail(sail.key)
        const retired = sail.retiredOn !== null
        return (
          <div
            key={sail.id}
            style={{ padding: '12px 4px', borderBottom: '1px solid var(--surface-divider)' }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span
                style={{
                  fontFamily: 'var(--font-body)', fontSize: 'var(--text-base)', fontWeight: 600,
                  color: retired ? 'var(--text-muted)' : 'var(--text-primary)',
                  textDecoration: retired ? 'line-through' : 'none',
                }}
              >
                {sail.label}
              </span>
              {retired && (
                <span
                  style={{
                    fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
                    letterSpacing: '0.06em', textTransform: 'uppercase',
                    color: 'var(--text-muted)',
                  }}
                >
                  retired {longDateOf(sail.retiredOn as string)}
                </span>
              )}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                color: 'var(--text-muted)', marginTop: '2px',
              }}
            >
              {races.length === 0
                ? 'Named in no race yet'
                : `Named in ${races.length} ${races.length === 1 ? 'race' : 'races'}${
                    retired ? ' — which still read it' : ''
                  }`}
            </div>
          </div>
        )
      })}
      <p
        style={{
          margin: '14px 0 0', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
          color: 'var(--text-secondary)', lineHeight: 1.5,
        }}
      >
        Retiring a sail takes it off the picker for new races and leaves every
        race that named it exactly as it was. There is no delete.
      </p>
      <AdminBlock
        viewer={viewer}
        actions={[
          { label: 'Add a sail', onClick: () => undefined },
          {
            label: 'Retire a sail',
            hint: 'Retire, never delete — a race that named this sail must still read it years later.',
            onClick: () => undefined,
          },
        ]}
      />
    </>
  )
}

function Artifact({
  kind,
  viewer,
  onGo,
}: {
  kind: ArtifactKind
  viewer: Viewer
  onGo: (s: Screen) => void
}): React.ReactElement {
  const versions = versionsOf(kind)
  const [selectedId, setSelectedId] = useState(versions[0].id)
  const selected = versionById(selectedId)
  const log = useMemo(() => calibrationLog(), [])

  return (
    <>
      <Head
        title={ARTIFACT_LABEL[kind]}
        sub={`${versions.length} ${versions.length === 1 ? 'version' : 'versions'}`}
        onBack={() => onGo({ name: 'management' })}
      />

      {versions.length > 1 && (
        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {versions.map((v) => (
            <button
              key={v.id}
              onClick={() => setSelectedId(v.id)}
              style={{
                padding: '6px 11px', borderRadius: '999px', cursor: 'pointer',
                fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)',
                border:
                  v.id === selectedId
                    ? '1.5px solid var(--blue-500)'
                    : '1px solid var(--surface-border)',
                background: v.id === selectedId ? 'var(--blue-muted)' : 'var(--surface-raised)',
                color: v.id === selectedId ? 'var(--text-accent)' : 'var(--text-secondary)',
              }}
            >
              v{v.versionNumber}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div style={{ marginBottom: '18px' }}>
          <div
            style={{
              fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
              color: 'var(--text-secondary)',
            }}
          >
            Effective from <Mono>{longDateOf(selected.effectiveFrom)}</Mono> · recorded{' '}
            <Mono>{longDateOf(selected.recordedAt)}</Mono> by {selected.createdBy}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)', marginTop: '3px',
            }}
          >
            {selected.filename === null ? 'typed in — no file' : `${selected.filename} · sha ${selected.contentSha256}`}
          </div>
          {selected.note && (
            <p
              style={{
                margin: '8px 0 0', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                color: 'var(--text-secondary)', lineHeight: 1.5,
              }}
            >
              {selected.note}
            </p>
          )}
        </div>
      )}

      {kind === 'polar' && <PolarTable payload={POLAR_PAYLOADS[selectedId]} />}
      {kind === 'crossover_chart' && <CrossoverMatrix payload={CROSSOVER_PAYLOADS[selectedId]} />}
      {kind === 'rig_tune' && <RigTuneBands bands={RIG_BANDS} />}
      {kind === 'instrument_calibration' && (
        <>
          <CalibrationValues payload={CALIBRATION_PAYLOADS[selectedId]} />
          <Section title="Calibration Log">
            <p
              style={{
                margin: '0 0 12px', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                color: 'var(--text-muted)', lineHeight: 1.5,
              }}
            >
              One list. Value changes and valueless acts sit in the same
              chronology, because when you are looking for &ldquo;what happened
              to this instrument&rdquo; they are the same question.
            </p>
            {log.map((entry) => (
              <div
                key={entry.kind === 'version' ? entry.version.id : entry.event.id}
                style={{
                  padding: '12px 0', borderBottom: '1px solid var(--surface-divider)',
                  display: 'flex', gap: '10px',
                }}
              >
                <div
                  style={{
                    width: '78px', flex: '0 0 auto', fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-sm)', color: 'var(--text-muted)',
                  }}
                >
                  {longDateOf(entry.on)}
                </div>
                <div style={{ flex: 1 }}>
                  {entry.kind === 'version' ? (
                    <>
                      <div
                        style={{
                          fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                          fontWeight: 600, color: 'var(--text-primary)',
                        }}
                      >
                        Values changed · v{entry.version.versionNumber}
                      </div>
                      {entry.changes.length === 0 ? (
                        <div
                          style={{
                            fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                            color: 'var(--text-muted)',
                          }}
                        >
                          No numbers moved.
                        </div>
                      ) : (
                        entry.changes.map((change) => (
                          <div
                            key={`${change.channel}-${change.field}`}
                            style={{
                              fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            {changeLabel(change)}
                          </div>
                        ))
                      )}
                      {entry.version.note && (
                        <p
                          style={{
                            margin: '4px 0 0', fontFamily: 'var(--font-body)',
                            fontSize: 'var(--text-sm)', color: 'var(--text-muted)',
                          }}
                        >
                          {entry.version.note}
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <div
                        style={{
                          fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                          fontWeight: 600, color: 'var(--wind-heavy)',
                        }}
                      >
                        Calibration Event · autocompensation on {entry.event.channels.join(', ')}
                      </div>
                      <p
                        style={{
                          margin: '4px 0 0', fontFamily: 'var(--font-body)',
                          fontSize: 'var(--text-sm)', color: 'var(--text-secondary)',
                          lineHeight: 1.45,
                        }}
                      >
                        {entry.event.note}
                      </p>
                      <p
                        style={{
                          margin: '4px 0 0', fontFamily: 'var(--font-body)',
                          fontSize: 'var(--text-sm)', color: 'var(--text-muted)',
                        }}
                      >
                        No programmed number changed — the instrument rebuilt its
                        own table.
                      </p>
                    </>
                  )}
                </div>
              </div>
            ))}
          </Section>
        </>
      )}

      <AdminBlock
        viewer={viewer}
        actions={
          kind === 'instrument_calibration'
            ? [
                {
                  label: 'Record new values',
                  hint: 'You changed what is programmed into the instrument. This makes a new Version, effective from the day you changed it.',
                  onClick: () => undefined,
                },
                {
                  label: 'Log a Calibration Event',
                  hint: 'You performed a calibration act with no number to type — an autocompensation, a swing, a paddlewheel swap. Nothing is versioned; the act is recorded.',
                  onClick: () => undefined,
                },
                {
                  label: `Correct v${versionById(selectedId)?.versionNumber} in place`,
                  hint: 'Only for fixing a mistyped figure. Calibration Versions are the one artifact edited in place, because a typo here is not a history.',
                  onClick: () => undefined,
                },
              ]
            : [
                {
                  label: `Upload a new ${ARTIFACT_LABEL[kind]} version`,
                  hint: 'A new Version, effective from a date you choose. Races already pointing at v1 keep pointing at v1.',
                  onClick: () => undefined,
                },
              ]
        }
      />
    </>
  )
}

function RaceList({
  viewer,
  onGo,
}: {
  viewer: Viewer
  onGo: (s: Screen) => void
}): React.ReactElement {
  const races = useMemo(() => racesByDateDesc(RACES), [])
  return (
    <>
      {races.map((race) => (
        <ListRow key={race.id} onClick={() => onGo({ name: 'race', id: race.id })}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)',
                color: 'var(--text-muted)', flex: '0 0 auto',
              }}
            >
              {shortDateOf(race.windowStart)}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-body)', fontSize: 'var(--text-base)',
                color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {race.title ?? (
                <span style={{ color: 'var(--text-secondary)' }}>
                  {clockOf(race.windowStart)}–{clockOf(race.windowFinish)}
                </span>
              )}
            </span>
          </div>
          <div
            style={{
              fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
              color: 'var(--text-muted)', marginTop: '2px',
            }}
          >
            {race.title !== null && `${clockOf(race.windowStart)}–${clockOf(race.windowFinish)} · `}
            {durationLabel((Date.parse(`${race.windowFinish}Z`) - Date.parse(`${race.windowStart}Z`)) / 60000)}
            {!isAnnotated(race) && ' · not remembered'}
          </div>
        </ListRow>
      ))}
      <p
        style={{
          margin: '14px 0 0', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
          color: 'var(--text-muted)', lineHeight: 1.5,
        }}
      >
        Two entries on 6 June come from one uploaded file. The list shows them as
        two races because that is what they are; the file is mentioned on the
        race, not here.
      </p>
      <AdminBlock
        viewer={viewer}
        actions={[
          {
            label: 'Upload a recording',
            hint: 'The file is stored byte for byte and transcribed once. Nothing about it is ever rewritten.',
            onClick: () => undefined,
          },
          {
            label: 'Mark a race in a recording',
            hint: 'Pick the file, type the start and the finish. One file can carry several races.',
            onClick: () => undefined,
          },
        ]}
      />
    </>
  )
}

function Overall(): React.ReactElement {
  return (
    <>
      <Seam>
        <strong style={{ color: 'var(--text-primary)' }}>Not yet.</strong> Nothing
        analyses these races so far — the archive is being filled first, on
        purpose, so the first analysis runs against a real season instead of
        three files.
      </Seam>

      <Section title="What will be here">
        {[
          ['Speed against the Polar', 'Boat speed as a fraction of target, upwind and down, once a Polar we trust exists.'],
          ['Where the Crossover Chart was wrong', 'Races where the sail you flew is not the sail the chart calls for, at the wind you actually had.'],
          ['Tack and gybe cost', 'Seconds and boat lengths lost per manoeuvre, from the rows either side of it.'],
          ['Rig Tune by band', 'Which tune the boat was on, and whether it made any difference. Needs Rig Tune pointers, which no race has yet.'],
        ].map(([title, body]) => (
          <div
            key={title}
            style={{
              padding: '12px 0', borderBottom: '1px solid var(--surface-divider)',
              opacity: 0.75,
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-body)', fontSize: 'var(--text-base)',
                fontWeight: 600, color: 'var(--text-secondary)',
              }}
            >
              {title}
            </div>
            <p
              style={{
                margin: '3px 0 0', fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-sm)', color: 'var(--text-muted)', lineHeight: 1.45,
              }}
            >
              {body}
            </p>
          </div>
        ))}
      </Section>

      <p
        style={{
          margin: '18px 0 0', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
          color: 'var(--text-muted)', lineHeight: 1.5,
        }}
      >
        Variant A shows no numbers at all on this tab. A count of races is not
        performance, and putting one here would make the tab look like it works.
      </p>
    </>
  )
}

function RaceDetail({
  race,
  viewer,
  onGo,
}: {
  race: Race
  viewer: Viewer
  onGo: (s: Screen) => void
}): React.ReactElement {
  const analysis = useMemo(() => analyseRace(race), [race])
  const [showRows, setShowRows] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const seaState = resolveSeaStateAt(race, race.windowStart)

  const pointers: { label: string; value: React.ReactNode }[] = [
    {
      label: 'Polar',
      value: versionById(race.polarVersionId)
        ? `v${versionById(race.polarVersionId)?.versionNumber}`
        : null,
    },
    {
      label: 'Crossover Chart',
      value: versionById(race.crossoverVersionId)
        ? `v${versionById(race.crossoverVersionId)?.versionNumber}`
        : null,
    },
    {
      label: 'Rig Tune',
      value: versionById(race.rigTuneVersionId)
        ? `v${versionById(race.rigTuneVersionId)?.versionNumber}`
        : null,
    },
    {
      label: 'Instrument Calibration',
      value: versionById(race.calibrationVersionId)
        ? `v${versionById(race.calibrationVersionId)?.versionNumber}`
        : null,
    },
  ]

  return (
    <>
      <Head
        title={race.title ?? longDateOf(race.windowStart)}
        sub={
          race.title === null
            ? 'No title. Layline does not invent one.'
            : longDateOf(race.windowStart)
        }
        onBack={() => onGo({ name: 'performance', tab: 'races' })}
      />

      <Section title="Race Window">
        <div
          style={{
            fontFamily: 'var(--font-mono)', fontSize: 'var(--text-lg)',
            color: 'var(--text-primary)',
          }}
        >
          {clockWithSecondsOf(race.windowStart)} → {clockWithSecondsOf(race.windowFinish)}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
            color: 'var(--text-muted)', marginTop: '3px',
          }}
        >
          {durationLabel(analysis.windowMinutes)} · typed in from memory, not from the file
        </div>
      </Section>

      <Section title="Coverage">
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
          <div style={{ marginTop: '10px' }}>
            <SpanList spans={analysis.frozenSpans} kind="Frozen" />
          </div>
        )}
        {analysis.notWaterReferencedSpans.length > 0 && (
          <div style={{ marginTop: '6px' }}>
            <SpanList spans={analysis.notWaterReferencedSpans} kind="No paddlewheel" />
          </div>
        )}
        <div
          style={{
            marginTop: '10px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
          }}
        >
          derived at read · {DETECTOR_VERSION}
        </div>
      </Section>

      <Section title="Testimony">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div>
            <Label>Sails</Label>
            {race.sailEntries.length === 0 ? (
              <NotRecorded />
            ) : (
              race.sailEntries.map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <Mono>{clockOf(entry.at)}</Mono> {sailConfigLabel(entry)}
                </div>
              ))
            )}
          </div>
          <div>
            <Label>Sea State</Label>
            {seaState === null ? (
              <NotRecorded />
            ) : (
              <span
                style={{
                  fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                  color: 'var(--text-primary)',
                }}
              >
                {SEA_STATE_LABEL[seaState.seaState]}
              </span>
            )}
          </div>
          <div>
            <Label>Wind Band as recorded</Label>
            <NotRecorded />
          </div>
        </div>
      </Section>

      <Section title="Setup at the time">
        {pointers.map((p) => (
          <div
            key={p.label}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '9px 0', borderBottom: '1px solid var(--surface-divider)',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                color: 'var(--text-secondary)',
              }}
            >
              {p.label}
            </span>
            {p.value === null ? (
              <NotRecorded />
            ) : (
              <span
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)',
                  color: 'var(--text-primary)',
                }}
              >
                {p.value}
              </span>
            )}
          </div>
        ))}
      </Section>

      <Section title="Analysis">
        <Seam>
          <strong style={{ color: 'var(--text-primary)' }}>Nothing yet.</strong> A
          track, VMG against the polar, and the manoeuvre count all belong on
          this screen and none of them exist. The seam is left visible rather
          than filled with a chart, so nobody mistakes a plot for an answer.
        </Seam>
      </Section>

      <Section title="Transcription">
        <p
          style={{
            margin: '0 0 10px', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
            color: 'var(--text-secondary)', lineHeight: 1.5,
          }}
        >
          <Mono>{analysis.race.recordingId}</Mono> · {analysis.allRows.length} rows in the
          file, {analysis.windowRows.length} inside this window. Read-only by
          every path there is.
        </p>
        <button
          onClick={() => setShowRows(!showRows)}
          style={{
            background: 'transparent', border: 'none', padding: 0,
            fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
            color: 'var(--text-accent)', cursor: 'pointer',
          }}
        >
          {showRows ? 'Hide the rows' : 'Show the rows'}
        </button>
        {showRows && (
          <div style={{ marginTop: '12px' }}>
            <RowTable rows={analysis.windowRows} quality={analysis.windowQuality} />
          </div>
        )}
        <div style={{ marginTop: '14px' }}>
          <ProvenanceSentence text={analysis.provenanceSentence} />
        </div>
      </Section>

      <AdminBlock
        viewer={viewer}
        actions={[
          {
            label: 'Amend this race',
            hint: 'The window, the annotations, the setup pointers and the title. Never the file.',
            onClick: () => onGo({ name: 'amend', id: race.id }),
          },
          {
            label: confirmDelete ? 'Confirm delete — this cannot be undone' : 'Delete this race',
            danger: true,
            hint: confirmDelete
              ? 'Takes the annotations, the Transcription and the stored file with it.'
              : undefined,
            onClick: () => setConfirmDelete(!confirmDelete),
          },
        ]}
        note="Amending is a separate screen in Variant A, so reading a race and rewriting one never look alike."
      />
    </>
  )
}

function Amend({
  race,
  onGo,
}: {
  race: Race
  onGo: (s: Screen) => void
}): React.ReactElement {
  const [start, setStart] = useState(race.windowStart)
  const [finish, setFinish] = useState(race.windowFinish)
  const [title, setTitle] = useState(race.title ?? '')
  const refusal = checkWindow(race.recordingId, start, finish)

  const field = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    hint?: string
  ): React.ReactElement => (
    <div key={label} style={{ marginBottom: '16px' }}>
      <Label>{label}</Label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%', padding: '10px 12px', borderRadius: 'var(--input-radius)',
          border: '1px solid var(--input-border)', background: 'var(--input-bg)',
          color: 'var(--input-fg)', fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-sm)',
        }}
      />
      {hint && (
        <p
          style={{
            margin: '5px 0 0', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
            color: 'var(--text-muted)',
          }}
        >
          {hint}
        </p>
      )}
    </div>
  )

  return (
    <>
      <Head
        title="Amend race"
        sub="Testimony only. The file is not on this screen."
        onBack={() => onGo({ name: 'race', id: race.id })}
      />

      {field('Race Window start', start, setStart, 'Naive wall clock, as the file writes it.')}
      {field('Race Window finish', finish, setFinish)}
      {field('Title (optional)', title, setTitle, 'Leave it empty. Layline never writes one for you.')}

      {!refusal.ok && (
        <div
          style={{
            padding: '12px 14px', borderRadius: '8px', marginBottom: '16px',
            border: '1px solid var(--state-danger)',
            background: 'color-mix(in srgb, var(--state-danger) 8%, transparent)',
            fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
            color: 'var(--state-danger)', lineHeight: 1.45,
          }}
        >
          {refusal.reason} This is the same check the upload path runs — one
          implementation, so an amendment cannot walk around it.
        </div>
      )}

      <Section title="Annotations">
        <p
          style={{
            margin: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
            color: 'var(--text-secondary)', lineHeight: 1.5,
          }}
        >
          Sail changes and sea state would be added, edited and deleted here, on
          this same screen. No change reason, no note, no history — a memory
          corrected is just a better memory.
        </p>
      </Section>

      <button
        disabled={!refusal.ok}
        onClick={() => onGo({ name: 'race', id: race.id })}
        style={{
          marginTop: '22px', width: '100%', padding: '13px', borderRadius: 'var(--btn-primary-radius)',
          border: 'none', cursor: refusal.ok ? 'pointer' : 'not-allowed',
          background: refusal.ok ? 'var(--btn-primary-bg)' : 'var(--surface-elevated)',
          color: refusal.ok ? 'var(--btn-primary-fg)' : 'var(--text-muted)',
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-base)', fontWeight: 600,
        }}
      >
        Save amendment
      </button>
    </>
  )
}

// ---------------------------------------------------------------------------

export default function VariantA({ viewer }: { viewer: Viewer }): React.ReactElement {
  const [screen, setScreen] = useState<Screen>({ name: 'management' })

  if (!isSignedIn(viewer)) {
    return (
      <div style={{ padding: '20px 16px 120px' }}>
        <DrawerPreview viewer={viewer} screen={screen} onGo={setScreen} />
        <Head title="Dashboard" sub="Signed out" />
        <Seam>
          Variant A&rsquo;s answer to the Guest question is <strong>silence</strong>.
          There is no Boat management entry, no Boat performance entry, no
          padlock and no &ldquo;sign in to see&rdquo;. Wind and forecast still
          work, exactly as they do now. Nothing on any signed-out screen implies
          a boat archive exists.
        </Seam>
        <p
          style={{
            margin: '16px 0 0', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
            color: 'var(--text-muted)', lineHeight: 1.5,
          }}
        >
          The cost: a returning sailor who has been signed out has no visible
          route back to their own archive except the Settings sign-in.
        </p>
      </div>
    )
  }

  const race =
    screen.name === 'race' || screen.name === 'amend'
      ? RACES.find((r) => r.id === screen.id)
      : undefined

  return (
    <div style={{ padding: '20px 16px 120px' }}>
      <DrawerPreview viewer={viewer} screen={screen} onGo={setScreen} />

      {screen.name === 'management' && <Management viewer={viewer} onGo={setScreen} />}
      {screen.name === 'sails' && <Sails viewer={viewer} onGo={setScreen} />}
      {screen.name === 'artifact' && (
        <Artifact kind={screen.kind} viewer={viewer} onGo={setScreen} />
      )}
      {screen.name === 'performance' && (
        <>
          <Head title="Boat performance" sub={`${RACES.length} races · one boat`} />
          <div
            style={{
              display: 'flex', gap: '4px', marginBottom: '16px',
              borderBottom: '1px solid var(--surface-border)',
            }}
          >
            {(['races', 'overall'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setScreen({ name: 'performance', tab })}
                style={{
                  padding: '9px 14px', background: 'transparent', cursor: 'pointer',
                  border: 'none',
                  borderBottom:
                    screen.tab === tab ? '2px solid var(--blue-500)' : '2px solid transparent',
                  fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                  fontWeight: screen.tab === tab ? 700 : 500,
                  color: screen.tab === tab ? 'var(--text-primary)' : 'var(--text-muted)',
                  textTransform: 'capitalize',
                }}
              >
                {tab}
              </button>
            ))}
          </div>
          {screen.tab === 'races' ? <RaceList viewer={viewer} onGo={setScreen} /> : <Overall />}
        </>
      )}
      {screen.name === 'race' && race && (
        <RaceDetail race={race} viewer={viewer} onGo={setScreen} />
      )}
      {screen.name === 'amend' && race && <Amend race={race} onGo={setScreen} />}
    </div>
  )
}
