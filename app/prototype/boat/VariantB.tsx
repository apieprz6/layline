'use client'

/**
 * PROTOTYPE — throwaway. See ./README.md.
 *
 * VARIANT B — "Evidence-first".
 *
 * The position: the archive already holds a great deal that needs no analysis
 * engine at all — a track, a speed trace, an honest account of how good the
 * rows are — so show it, and let the missing engine be the one thing that is
 * missing. Its answers:
 *
 *   Q1  A race row is emphatically worth tapping: the detail screen opens on
 *       the track, then the SOG and TWS traces, then the raw rows. Frozen spans
 *       are drawn as breaks, never as flat line.
 *   Q2  Overall carries real figures — but only counts and sums over Testimony
 *       and Row Quality, each labelled as not being a performance claim.
 *   Q3  Artifacts render as heat grids you tap to read, sized to the screen
 *       rather than scrolled.
 *   Q4  A Guest sees both entries, locked, with an explicit invitation.
 *   Q6  Admin writes are an "Amend" mode on the screen itself: fields become
 *       inputs in place, and the Transcription block stays visibly outside it.
 *   Q7  Boat identity is the header of Boat management.
 */

import React, { useMemo, useState } from 'react'
import {
  ARTIFACT_LABEL,
  BOAT,
  CALIBRATION_PAYLOADS,
  CHANNELS,
  CROSSOVER_PAYLOADS,
  POLAR_PAYLOADS,
  RACES,
  RECORDINGS,
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
  archiveSummary,
  calibrationLog,
  changeLabel,
  checkWindow,
  isAnnotated,
  resolveSeaStateAt,
  seriesOf,
} from './derive'
import {
  CalibrationValues,
  CrossoverMatrix,
  Label,
  Mono,
  NotRecorded,
  PolarHeat,
  ProvenanceSentence,
  QualityBar,
  QualityKey,
  RigTuneBands,
  RowTable,
  Seam,
  SpanList,
  TraceChart,
  TrackMap,
  bandLabel,
} from './primitives'
import { canWrite, isSignedIn, type Viewer } from './viewer'

type Tab = 'setup' | 'races' | 'overall'

// ---------------------------------------------------------------------------

function Card({
  title,
  right,
  onClick,
  children,
}: {
  title: string
  right?: React.ReactNode
  onClick?: () => void
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div
      onClick={onClick}
      style={{
        border: '1px solid var(--card-border)', borderRadius: 'var(--card-radius)',
        background: 'var(--card-bg)', padding: '14px', marginBottom: '12px',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: '10px',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-display)', fontSize: 'var(--text-base)', fontWeight: 700,
            color: 'var(--text-primary)',
          }}
        >
          {title}
        </span>
        {right}
      </div>
      {children}
    </div>
  )
}

function Sheet({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'flex-end',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxHeight: '88vh', overflowY: 'auto',
          background: 'var(--surface-raised)', borderTopLeftRadius: '14px',
          borderTopRightRadius: '14px', borderTop: '1px solid var(--surface-border)',
          padding: '16px 16px 90px',
        }}
      >
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: '14px',
          }}
        >
          <h2
            style={{
              margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)',
              fontWeight: 700, color: 'var(--text-primary)',
            }}
          >
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', fontSize: '20px', lineHeight: 1, padding: '2px 6px',
            }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function PrimaryButton({
  label,
  onClick,
  danger,
  disabled,
}: {
  label: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '9px 14px', borderRadius: 'var(--btn-primary-radius)', cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600,
        border: danger ? '1px solid var(--state-danger)' : 'none',
        background: danger
          ? 'transparent'
          : disabled
            ? 'var(--surface-elevated)'
            : 'var(--btn-primary-bg)',
        color: danger ? 'var(--state-danger)' : disabled ? 'var(--text-muted)' : 'var(--btn-primary-fg)',
      }}
    >
      {label}
    </button>
  )
}

/** Variant B's drawer: the entries are visible to a Guest, and locked. */
function DrawerPreview({ viewer }: { viewer: Viewer }): React.ReactElement {
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
      {['Boat management', 'Boat performance'].map((label) => (
        <div
          key={label}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 8px',
            fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
            color: isSignedIn(viewer) ? 'var(--text-secondary)' : 'var(--text-muted)',
          }}
        >
          {label}
          {!isSignedIn(viewer) && (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="4" y="11" width="16" height="10" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
              <span
                style={{
                  marginLeft: 'auto', fontFamily: 'var(--font-body)',
                  fontSize: 'var(--text-xs)', color: 'var(--text-accent)',
                }}
              >
                Sign in
              </span>
            </>
          )}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Setup tab — what the boat is set to now
// ---------------------------------------------------------------------------

function SetupTab({ viewer }: { viewer: Viewer }): React.ReactElement {
  const [sheet, setSheet] = useState<ArtifactKind | 'sails' | null>(null)
  const polar = currentVersionOf('polar')
  const crossover = currentVersionOf('crossover_chart')
  const rig = currentVersionOf('rig_tune')
  const cal = currentVersionOf('instrument_calibration')
  const base = RIG_BANDS.find((b) => b.isBase)
  const log = useMemo(() => calibrationLog(), [])

  const versionChip = (kind: ArtifactKind): React.ReactElement => (
    <span
      style={{
        fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
        color: 'var(--text-muted)', border: '1px solid var(--surface-border)',
        borderRadius: '999px', padding: '2px 8px',
      }}
    >
      v{currentVersionOf(kind).versionNumber} · {versionsOf(kind).length} total
    </span>
  )

  return (
    <>
      <div style={{ marginBottom: '18px' }}>
        <h1
          style={{
            margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)',
            fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)',
          }}
        >
          {BOAT.name}
        </h1>
        <div
          style={{
            fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
            color: 'var(--text-muted)',
          }}
        >
          {BOAT.model} · what the boat is set to right now
        </div>
        {canWrite(viewer) && (
          <div style={{ marginTop: '10px' }}>
            <PrimaryButton label="Edit boat" onClick={() => undefined} />
          </div>
        )}
      </div>

      <Card title="Instrument Calibration" right={versionChip('instrument_calibration')} onClick={() => setSheet('instrument_calibration')}>
        <CalibrationValues payload={CALIBRATION_PAYLOADS[cal.id]} />
        <div
          style={{
            marginTop: '8px', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
            color: 'var(--text-muted)',
          }}
        >
          Effective {longDateOf(cal.effectiveFrom)} · {log.length} entries in the log
        </div>
      </Card>

      <Card title="Rig Tune" right={versionChip('rig_tune')} onClick={() => setSheet('rig_tune')}>
        {base && (
          <div
            style={{
              fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)',
              color: 'var(--text-primary)',
            }}
          >
            Base {bandLabel(base)} · V1 {base.shrouds.V1.port.gapMm.toFixed(1)} mm · D1{' '}
            {base.shrouds.D1.port.gapMm.toFixed(1)} mm · D2 {base.shrouds.D2.port.gapMm.toFixed(1)} mm
          </div>
        )}
        <div
          style={{
            marginTop: '6px', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
            color: 'var(--text-muted)',
          }}
        >
          {RIG_BANDS.length} bands, one base, top band open above{' '}
          {RIG_BANDS[RIG_BANDS.length - 1].lowKt} kt. First measured{' '}
          {longDateOf(rig.effectiveFrom)} — so no race in the archive points at it.
        </div>
      </Card>

      <Card title="Crossover Chart" right={versionChip('crossover_chart')} onClick={() => setSheet('crossover_chart')}>
        <div
          style={{
            fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
            color: 'var(--text-muted)',
          }}
        >
          {CROSSOVER_PAYLOADS[crossover.id].twaAxis.length} angles ×{' '}
          {CROSSOVER_PAYLOADS[crossover.id].twsAxis.length} wind speeds ·{' '}
          {CROSSOVER_PAYLOADS[crossover.id].sailDefinitions.length} Sail Definitions. Tap to
          read it.
        </div>
      </Card>

      <Card title="Polar" right={versionChip('polar')} onClick={() => setSheet('polar')}>
        <div
          style={{
            fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
            color: 'var(--text-muted)',
          }}
        >
          {POLAR_PAYLOADS[polar.id].twaAxis.length} × {POLAR_PAYLOADS[polar.id].twsAxis.length},
          from a certificate. Never measured on this boat — {polar.note}
        </div>
      </Card>

      <Card
        title="Sail Inventory"
        right={
          <span
            style={{
              fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
            }}
          >
            unversioned
          </span>
        }
        onClick={() => setSheet('sails')}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {SAILS.map((sail) => (
            <span
              key={sail.id}
              style={{
                padding: '4px 10px', borderRadius: '999px',
                fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                border: '1px solid var(--surface-border)',
                background: sail.retiredOn === null ? 'var(--surface-elevated)' : 'transparent',
                color: sail.retiredOn === null ? 'var(--text-primary)' : 'var(--text-muted)',
                textDecoration: sail.retiredOn === null ? 'none' : 'line-through',
              }}
            >
              {sail.label}
            </span>
          ))}
        </div>
      </Card>

      {sheet !== null && (
        <Sheet
          title={sheet === 'sails' ? 'Sail Inventory' : ARTIFACT_LABEL[sheet]}
          onClose={() => setSheet(null)}
        >
          {sheet === 'polar' && <PolarHeat payload={POLAR_PAYLOADS[polar.id]} />}
          {sheet === 'crossover_chart' && (
            <CrossoverMatrix payload={CROSSOVER_PAYLOADS[crossover.id]} />
          )}
          {sheet === 'rig_tune' && <RigTuneBands bands={RIG_BANDS} />}
          {sheet === 'instrument_calibration' && (
            <>
              <CalibrationValues payload={CALIBRATION_PAYLOADS[cal.id]} />
              <div style={{ marginTop: '18px' }}>
                <Label>Calibration Log · one list, two tables behind it</Label>
                {log.map((entry) => (
                  <div
                    key={entry.kind === 'version' ? entry.version.id : entry.event.id}
                    style={{
                      display: 'flex', gap: '10px', padding: '10px 0',
                      borderBottom: '1px solid var(--surface-divider)',
                    }}
                  >
                    <span
                      style={{
                        width: '6px', flex: '0 0 auto', borderRadius: '3px',
                        background:
                          entry.kind === 'version' ? 'var(--blue-500)' : 'var(--wind-heavy)',
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
                          color: 'var(--text-muted)',
                        }}
                      >
                        {longDateOf(entry.on)}
                      </div>
                      {entry.kind === 'version' ? (
                        <>
                          <div
                            style={{
                              fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                              fontWeight: 600, color: 'var(--text-primary)',
                            }}
                          >
                            Programmed values · v{entry.version.versionNumber}
                          </div>
                          {entry.changes.map((c) => (
                            <div
                              key={`${c.channel}-${c.field}`}
                              style={{
                                fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)',
                                color: 'var(--text-secondary)',
                              }}
                            >
                              {changeLabel(c)}
                            </div>
                          ))}
                          {canWrite(viewer) && (
                            <button
                              onClick={() => undefined}
                              style={{
                                marginTop: '5px', background: 'transparent', border: 'none',
                                padding: 0, fontFamily: 'var(--font-body)',
                                fontSize: 'var(--text-sm)', color: 'var(--text-accent)',
                                cursor: 'pointer',
                              }}
                            >
                              Correct these numbers in place
                            </button>
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
                            Calibration Event · {entry.event.type} on{' '}
                            {entry.event.channels.join(', ')}
                          </div>
                          <p
                            style={{
                              margin: '3px 0 0', fontFamily: 'var(--font-body)',
                              fontSize: 'var(--text-sm)', color: 'var(--text-secondary)',
                              lineHeight: 1.45,
                            }}
                          >
                            {entry.event.note}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {canWrite(viewer) && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
                  <PrimaryButton label="I changed the numbers" onClick={() => undefined} />
                  <PrimaryButton label="I ran a calibration" onClick={() => undefined} />
                </div>
              )}
              {canWrite(viewer) && (
                <p
                  style={{
                    margin: '10px 0 0', fontFamily: 'var(--font-body)',
                    fontSize: 'var(--text-sm)', color: 'var(--text-muted)', lineHeight: 1.45,
                  }}
                >
                  Two buttons, phrased as what you did rather than as what the
                  system stores. The first writes {CHANNELS.length} channels of
                  values and takes effect from a date; the second records that an
                  act happened and has no values at all.
                </p>
              )}
            </>
          )}
          {sheet === 'sails' && (
            <>
              {SAILS.map((sail) => (
                <div
                  key={sail.id}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                    padding: '11px 0', borderBottom: '1px solid var(--surface-divider)',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-body)', fontSize: 'var(--text-base)',
                      color: sail.retiredOn === null ? 'var(--text-primary)' : 'var(--text-muted)',
                      textDecoration: sail.retiredOn === null ? 'none' : 'line-through',
                    }}
                  >
                    {sail.label}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {racesUsingSail(sail.key).length} races
                    {sail.retiredOn !== null && ` · retired ${longDateOf(sail.retiredOn)}`}
                  </span>
                </div>
              ))}
              {canWrite(viewer) && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                  <PrimaryButton label="Add a sail" onClick={() => undefined} />
                  <PrimaryButton label="Retire a sail" onClick={() => undefined} danger />
                </div>
              )}
            </>
          )}

          {canWrite(viewer) && sheet !== 'sails' && sheet !== 'instrument_calibration' && (
            <div style={{ marginTop: '18px' }}>
              <PrimaryButton label={`New ${ARTIFACT_LABEL[sheet]} version`} onClick={() => undefined} />
            </div>
          )}
        </Sheet>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Races tab — dense rows, each carrying its own coverage
// ---------------------------------------------------------------------------

function RaceRow({
  race,
  onOpen,
}: {
  race: Race
  onOpen: () => void
}): React.ReactElement {
  const analysis = useMemo(() => analyseRace(race), [race])
  const series = useMemo(
    () => seriesOf(analysis.windowRows, analysis.windowQuality, 'sog'),
    [analysis]
  )

  return (
    <button
      onClick={onOpen}
      style={{
        display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
        border: '1px solid var(--card-border)', borderRadius: 'var(--card-radius)',
        background: 'var(--card-bg)', padding: '12px', marginBottom: '10px',
        color: 'inherit',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)',
            color: 'var(--text-secondary)',
          }}
        >
          {shortDateOf(race.windowStart)}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-body)', fontSize: 'var(--text-base)', fontWeight: 600,
            color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {race.title ?? `${clockOf(race.windowStart)}–${clockOf(race.windowFinish)}`}
        </span>
        <span
          style={{
            marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)',
            color: 'var(--text-muted)', flex: '0 0 auto',
          }}
        >
          {durationLabel(analysis.windowMinutes)}
        </span>
      </div>

      <div style={{ margin: '8px 0 6px' }}>
        <TraceChart series={series} unit="kt" height={34} />
      </div>

      <QualityBar counts={analysis.counts} />

      <div
        style={{
          marginTop: '6px', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
          color:
            analysis.counts.frozen > 0 || analysis.uncoveredMinutes > 0
              ? 'var(--wind-heavy)'
              : 'var(--text-muted)',
          lineHeight: 1.4,
        }}
      >
        {analysis.coverageSentence}
      </div>

      {!isAnnotated(race) && (
        <div style={{ marginTop: '6px' }}>
          <NotRecorded label="Nothing remembered about this one" />
        </div>
      )}
    </button>
  )
}

function RacesTab({ viewer }: { viewer: Viewer }): React.ReactElement {
  const [openId, setOpenId] = useState<string | null>(null)
  const races = useMemo(() => racesByDateDesc(RACES), [])
  const open = races.find((r) => r.id === openId)

  return (
    <>
      <div style={{ marginBottom: '14px' }}>
        <h1
          style={{
            margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)',
            fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em',
          }}
        >
          Races
        </h1>
        <div
          style={{
            fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
            color: 'var(--text-muted)',
          }}
        >
          {RACES.length} races from {RECORDINGS.length} uploads of{' '}
          {new Set(RECORDINGS.map((r) => r.contentSha256)).size} distinct files — 6 June
          was uploaded twice, once for each of its races. Every line below the
          trace is derived when the row loads; none of it is stored.
        </div>
      </div>

      {canWrite(viewer) && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
          <PrimaryButton label="Upload a recording" onClick={() => undefined} />
          <PrimaryButton label="Mark a race" onClick={() => undefined} />
        </div>
      )}

      {races.map((race) => (
        <RaceRow key={race.id} race={race} onOpen={() => setOpenId(race.id)} />
      ))}

      {open && <RaceDetailSheet race={open} viewer={viewer} onClose={() => setOpenId(null)} />}
    </>
  )
}

// ---------------------------------------------------------------------------
// Race detail — the track first, and an Amend mode over the Testimony
// ---------------------------------------------------------------------------

function RaceDetailSheet({
  race,
  viewer,
  onClose,
}: {
  race: Race
  viewer: Viewer
  onClose: () => void
}): React.ReactElement {
  const analysis = useMemo(() => analyseRace(race), [race])
  const [amending, setAmending] = useState(false)
  const [start, setStart] = useState(race.windowStart)
  const [finish, setFinish] = useState(race.windowFinish)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const sog = useMemo(() => seriesOf(analysis.windowRows, analysis.windowQuality, 'sog'), [analysis])
  const tws = useMemo(() => seriesOf(analysis.windowRows, analysis.windowQuality, 'tws'), [analysis])
  const seaState = resolveSeaStateAt(race, race.windowStart)
  const refusal = checkWindow(race.recordingId, start, finish)

  return (
    <Sheet title={race.title ?? longDateOf(race.windowStart)} onClose={onClose}>
      <div
        style={{
          fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)',
          color: 'var(--text-secondary)', marginBottom: '4px',
        }}
      >
        {clockWithSecondsOf(race.windowStart)} → {clockWithSecondsOf(race.windowFinish)} ·{' '}
        {durationLabel(analysis.windowMinutes)}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
          color:
            analysis.counts.frozen > 0 || analysis.uncoveredMinutes > 0
              ? 'var(--wind-heavy)'
              : 'var(--text-muted)',
          marginBottom: '14px', lineHeight: 1.45,
        }}
      >
        {analysis.coverageSentence}
      </div>

      <TrackMap rows={analysis.windowRows} quality={analysis.windowQuality} />

      <div style={{ marginTop: '16px' }}>
        <Label>Speed over the ground</Label>
        <TraceChart series={sog} unit="kt" />
      </div>
      <div style={{ marginTop: '14px' }}>
        <Label>True wind speed · computed upstream, not measured</Label>
        <TraceChart series={tws} unit="kt" color="var(--wind-heavy)" />
      </div>

      <div style={{ marginTop: '16px' }}>
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
        <div
          style={{
            marginTop: '8px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
          }}
        >
          {DETECTOR_VERSION} · nothing here is stored on a row
        </div>
      </div>

      <div
        style={{
          marginTop: '20px', border: amending ? '1.5px solid var(--blue-500)' : '1px solid var(--surface-border)',
          borderRadius: '10px', padding: '14px',
          background: amending ? 'var(--blue-muted)' : 'var(--surface-elevated)',
        }}
      >
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: '10px',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-display)', fontSize: 'var(--text-base)', fontWeight: 700,
              color: 'var(--text-primary)',
            }}
          >
            Testimony {amending && '· editing'}
          </span>
          {canWrite(viewer) && (
            <PrimaryButton
              label={amending ? 'Done' : 'Amend'}
              onClick={() => setAmending(!amending)}
            />
          )}
        </div>

        {amending ? (
          <>
            {[
              ['Window start', start, setStart] as const,
              ['Window finish', finish, setFinish] as const,
            ].map(([label, value, setter]) => (
              <div key={label} style={{ marginBottom: '10px' }}>
                <Label>{label}</Label>
                <input
                  value={value}
                  onChange={(e) => setter(e.target.value)}
                  style={{
                    width: '100%', padding: '9px 11px', borderRadius: 'var(--input-radius)',
                    border: '1px solid var(--input-border)', background: 'var(--input-bg)',
                    color: 'var(--input-fg)', fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-sm)',
                  }}
                />
              </div>
            ))}
            {!refusal.ok && (
              <div
                style={{
                  padding: '10px 12px', borderRadius: '6px',
                  border: '1px solid var(--state-danger)',
                  fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                  color: 'var(--state-danger)', lineHeight: 1.45, marginBottom: '10px',
                }}
              >
                {refusal.reason}
              </div>
            )}
            <p
              style={{
                margin: '0 0 10px', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                color: 'var(--text-secondary)', lineHeight: 1.45,
              }}
            >
              Every annotation, every Version pointer and the title are editable
              here too. No reason is asked for and no history is kept: this is a
              memory, and a corrected memory is simply better.
            </p>
          </>
        ) : (
          <>
            <div style={{ marginBottom: '10px' }}>
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
            <div style={{ marginBottom: '10px' }}>
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
              <Label>Setup in force</Label>
              {(
                [
                  ['Polar', race.polarVersionId],
                  ['Crossover', race.crossoverVersionId],
                  ['Rig Tune', race.rigTuneVersionId],
                  ['Calibration', race.calibrationVersionId],
                ] as const
              ).map(([label, id]) => (
                <div
                  key={label}
                  style={{
                    display: 'flex', justifyContent: 'space-between', padding: '5px 0',
                    fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <span>{label}</span>
                  {versionById(id) ? (
                    <Mono>v{versionById(id)?.versionNumber}</Mono>
                  ) : (
                    <NotRecorded />
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div
        style={{
          marginTop: '16px', border: '1px solid var(--surface-border)', borderRadius: '10px',
          padding: '14px', background: 'var(--surface-base)',
        }}
      >
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          <span
            style={{
              fontFamily: 'var(--font-display)', fontSize: 'var(--text-base)', fontWeight: 700,
              color: 'var(--text-primary)',
            }}
          >
            Transcription · not editable by any path
          </span>
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)',
            color: 'var(--text-secondary)', marginBottom: '10px',
          }}
        >
          {analysis.allRows.length} rows · {analysis.windowRows.length} in this window
        </div>
        <RowTable rows={analysis.windowRows} quality={analysis.windowQuality} />
        <div style={{ marginTop: '12px' }}>
          <ProvenanceSentence text={analysis.provenanceSentence} />
        </div>
      </div>

      <div style={{ marginTop: '18px' }}>
        <Seam>
          <strong style={{ color: 'var(--text-primary)' }}>Still missing:</strong> the
          polar comparison, the tack count, the wind shift picture. Everything
          above this line is the file and your own memory of the day, drawn
          straight.
        </Seam>
      </div>

      {canWrite(viewer) && (
        <div style={{ marginTop: '18px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <PrimaryButton
            label={confirmDelete ? 'Confirm delete' : 'Delete race'}
            danger
            onClick={() => setConfirmDelete(!confirmDelete)}
          />
          {confirmDelete && (
            <p
              style={{
                margin: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                color: 'var(--state-danger)', lineHeight: 1.45,
              }}
            >
              Takes the annotations, the Transcription and the stored file. No undo.
            </p>
          )}
        </div>
      )}
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Overall tab — honest figures, none of them a performance claim
// ---------------------------------------------------------------------------

function OverallTab(): React.ReactElement {
  const summary = useMemo(() => archiveSummary(), [])

  const figures: { value: string; label: string }[] = [
    { value: String(summary.raceCount), label: 'races' },
    { value: durationLabel(summary.totalRacedMinutes), label: 'inside race windows' },
    { value: summary.rowsInWindows.toLocaleString('en-US'), label: 'rows raced' },
    { value: String(summary.recordingCount), label: 'recordings' },
    { value: String(summary.frozenRows), label: 'frozen rows' },
    { value: String(summary.notWaterReferencedRows), label: 'rows with no paddlewheel' },
  ]

  return (
    <>
      <div style={{ marginBottom: '14px' }}>
        <h1
          style={{
            margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)',
            fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em',
          }}
        >
          Overall
        </h1>
        <div
          style={{
            fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
            color: 'var(--text-muted)', lineHeight: 1.45,
          }}
        >
          {longDateOf(summary.firstRaceDate)} to {longDateOf(summary.lastRaceDate)}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        {figures.map((f) => (
          <div
            key={f.label}
            style={{
              border: '1px solid var(--card-border)', borderRadius: 'var(--card-radius)',
              background: 'var(--card-bg)', padding: '12px',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xl)', fontWeight: 700,
                color: 'var(--text-primary)',
              }}
            >
              {f.value}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                color: 'var(--text-muted)',
              }}
            >
              {f.label}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: '16px' }}>
        <Seam>
          <strong style={{ color: 'var(--text-primary)' }}>
            None of the above is performance.
          </strong>{' '}
          They are counts and sums over what was written down. Nothing here
          compares the boat to a target, to another boat, or to itself last
          month — that is the part that does not exist yet.
        </Seam>
      </div>

      <div style={{ marginTop: '20px' }}>
        <Label>What the archive is still short of</Label>
        <div
          style={{
            fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
            color: 'var(--text-secondary)', lineHeight: 1.6,
          }}
        >
          <div>
            <Mono>{summary.unrememberedRaces}</Mono> of <Mono>{summary.raceCount}</Mono> races
            have no annotation at all — no sails, no sea state.
          </div>
          <div>
            <Mono>{summary.racesMissingRigTune}</Mono> races point at no Rig Tune,
            because the first measured tune post-dates them.
          </div>
        </div>
      </div>

      <div style={{ marginTop: '20px' }}>
        <Label>Sail Configurations, by races that name them</Label>
        {summary.sailUsage.length === 0 ? (
          <NotRecorded label="No sails recorded on any race" />
        ) : (
          summary.sailUsage.map((use) => (
            <div
              key={use.label}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                  color: 'var(--text-primary)', flex: 1,
                }}
              >
                {use.label}
              </span>
              <div
                style={{
                  width: `${(use.races / summary.sailUsage[0].races) * 90}px`, height: '9px',
                  background: 'var(--wind-medium)', opacity: 0.65, borderRadius: '2px',
                }}
              />
              <Mono>{use.races}</Mono>
            </div>
          ))
        )}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------

function LockedGuest(): React.ReactElement {
  return (
    <>
      <h1
        style={{
          margin: '0 0 6px', fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)',
          fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em',
        }}
      >
        Boat performance
      </h1>
      <div
        style={{
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
          color: 'var(--text-muted)', marginBottom: '16px',
        }}
      >
        Sign in to read the archive.
      </div>

      <div style={{ position: 'relative', marginBottom: '18px' }}>
        <div style={{ filter: 'blur(4px)', opacity: 0.5, pointerEvents: 'none' }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                border: '1px solid var(--card-border)', borderRadius: 'var(--card-radius)',
                background: 'var(--card-bg)', padding: '12px', marginBottom: '10px',
              }}
            >
              <div
                style={{
                  height: '12px', width: `${55 + i * 12}%`, background: 'var(--surface-elevated)',
                  borderRadius: '3px', marginBottom: '10px',
                }}
              />
              <div
                style={{
                  height: '30px', background: 'var(--chart-bg-mid)', borderRadius: '3px',
                }}
              />
            </div>
          ))}
        </div>
        <div
          style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <PrimaryButton label="Sign in" onClick={() => undefined} />
          </div>
        </div>
      </div>

      <Seam>
        Variant B advertises the sections and shows nothing behind them: the
        shapes above are placeholders, not blurred data. The claim is that a
        locked door tells a returning sailor where their archive lives, and tells
        a stranger that this app is somebody&rsquo;s boat, not a public weather
        page.
      </Seam>
      <p
        style={{
          margin: '14px 0 0', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
          color: 'var(--text-muted)', lineHeight: 1.5,
        }}
      >
        The cost: two dead ends in the drawer for anyone who will never have an
        account, and a standing question about whether the boat&rsquo;s name
        belongs on a signed-out screen. Here it does not appear.
      </p>
    </>
  )
}

export default function VariantB({ viewer }: { viewer: Viewer }): React.ReactElement {
  const [tab, setTab] = useState<Tab>('setup')

  return (
    <div style={{ padding: '20px 16px 130px' }}>
      <DrawerPreview viewer={viewer} />

      {!isSignedIn(viewer) ? (
        <LockedGuest />
      ) : (
        <>
          <div
            style={{
              display: 'flex', gap: '6px', marginBottom: '18px', padding: '3px',
              borderRadius: '999px', background: 'var(--surface-elevated)',
              border: '1px solid var(--surface-border)',
            }}
          >
            {(
              [
                ['setup', 'Setup'],
                ['races', 'Races'],
                ['overall', 'Overall'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: '999px', border: 'none',
                  cursor: 'pointer', fontFamily: 'var(--font-body)',
                  fontSize: 'var(--text-sm)', fontWeight: tab === key ? 700 : 500,
                  background: tab === key ? 'var(--surface-raised)' : 'transparent',
                  color: tab === key ? 'var(--text-primary)' : 'var(--text-muted)',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'setup' && <SetupTab viewer={viewer} />}
          {tab === 'races' && <RacesTab viewer={viewer} />}
          {tab === 'overall' && <OverallTab />}
        </>
      )}
    </div>
  )
}
