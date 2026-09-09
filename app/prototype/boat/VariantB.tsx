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
 *   Q1  A race row is emphatically worth tapping. The row identifies the race
 *       by three derived figures — speed against the polar, the wind it was
 *       sailed in, and whether the Crossover Chart agrees with the sails that
 *       were up — and the detail screen opens on a scrubbable track and traces.
 *       Frozen spans are drawn as breaks, never as flat line. Row counts appear
 *       nowhere: how long the feed was dead is a fact about the race, how many
 *       lines that took is a fact about the file.
 *   Q2  Overall carries real figures — but only counts and sums over Testimony
 *       and Row Quality, each labelled as not being a performance claim.
 *   Q3  Artifacts render as heat grids you tap to read, sized to the screen
 *       rather than scrolled.
 *   Q4  A Guest sees both entries, locked, with an explicit invitation.
 *   Q6  Admin writes are an "Amend" mode on the screen itself, reached by one
 *       pencil at the top right: the Testimony chips become inputs in place, and
 *       the mode says out loud that the recording is not what is being edited.
 *   Q7  Boat identity is the header of Boat management.
 */

import { useSearchParams } from 'next/navigation'
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
  spanLabel,
  versionById,
  versionsOf,
  type ArtifactKind,
  type Race,
} from './fixture'
import {
  DETECTOR_VERSION,
  POLAR_SKIP_LABEL,
  WIND_BAND_COLOR,
  WIND_BAND_LABEL,
  analyseRace,
  archiveSummary,
  calibrationLog,
  changeLabel,
  checkWindow,
  isAnnotated,
  quickStats,
  resolveSeaStateAt,
  seriesOf,
  type RaceQuickStats,
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
  action,
  children,
}: {
  title: string
  onClose: () => void
  /** Sits left of the close button: on a race, the one pencil. */
  action?: React.ReactNode
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: '0 0 auto' }}>
            {action}
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

/**
 * One derived figure, with the honest empty case built in. A stat that cannot
 * be computed says so and says why; it never shows a plausible number.
 */
function Stat({
  value,
  unit,
  label,
  color,
  muted,
}: {
  value: string
  unit?: string
  label: string
  color?: string
  muted?: boolean
}): React.ReactElement {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          fontFamily: 'var(--font-mono)', fontSize: 'var(--text-lg)', fontWeight: 700,
          color: muted === true ? 'var(--text-muted)' : color ?? 'var(--text-primary)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          lineHeight: 1.2,
        }}
      >
        {value}
        {unit !== undefined && (
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}> {unit}</span>
        )}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
          color: 'var(--text-muted)', lineHeight: 1.3,
        }}
      >
        {label}
      </div>
    </div>
  )
}

/** How much of the window the polar comparison actually covers. */
function polarCoverage(stats: RaceQuickStats, windowMinutes: number): number {
  const total = windowMinutes * 60
  return total <= 0 ? 0 : stats.polar.scoredSeconds / total
}

function PolarStat({
  stats,
  windowMinutes,
}: {
  stats: RaceQuickStats
  windowMinutes: number
}): React.ReactElement {
  const percent = stats.polar.averagePercent
  if (percent === null) {
    return <Stat value="—" label="no polar figure" muted />
  }
  const coverage = polarCoverage(stats, windowMinutes)
  return (
    <Stat
      value={`${percent.toFixed(0)}%`}
      label={coverage < 0.6 ? `of polar · part of the race` : 'of polar target'}
      color={percent >= 100 ? 'var(--wind-light)' : 'var(--text-primary)'}
    />
  )
}

function WindStat({ stats }: { stats: RaceQuickStats }): React.ReactElement {
  const { averageTws, band } = stats.wind
  if (averageTws === null || band === null) {
    return <Stat value="—" label="no wind figure" muted />
  }
  return (
    <Stat
      value={averageTws.toFixed(1)}
      unit="kt"
      label={WIND_BAND_LABEL[band].toLowerCase()}
      color={WIND_BAND_COLOR[band]}
    />
  )
}

function CrossoverStat({ stats }: { stats: RaceQuickStats }): React.ReactElement {
  const check = stats.crossover
  if (check.status === 'no-sail-recorded') {
    return <Stat value="?" label="no sail recorded" muted />
  }
  if (check.status === 'no-chart') {
    return <Stat value="—" label="no crossover chart" muted />
  }
  if (check.status === 'agrees') {
    return (
      <Stat
        value="✓"
        // Never "agrees" flat when part of the race could not be checked at all.
        label={check.uncheckedSeconds > 0 ? 'chart agrees · part checked' : 'chart agrees'}
        color="var(--wind-light)"
      />
    )
  }
  if (check.dominant) {
    // Fifteen spans of the same fact is still one fact. Say the fact.
    return <Stat value="✗" label="log doesn't track this race" color="var(--wind-heavy)" />
  }
  return (
    <Stat
      value={spanLabel(check.disagreementSeconds)}
      label={check.spans.length === 1 ? 'off the chart' : `off the chart, ${check.spans.length} spans`}
      color="var(--wind-heavy)"
    />
  )
}

function RaceRow({
  race,
  onOpen,
}: {
  race: Race
  onOpen: () => void
}): React.ReactElement {
  const analysis = useMemo(() => analyseRace(race), [race])
  const stats = useMemo(() => quickStats(analysis), [analysis])

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

      <div
        style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px',
          margin: '10px 0 8px',
        }}
      >
        <PolarStat stats={stats} windowMinutes={analysis.windowMinutes} />
        <WindStat stats={stats} />
        <CrossoverStat stats={stats} />
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
  // `?race=race-0812` opens a race directly, same reason as `?tab=`.
  const searchParams = useSearchParams()
  const [openId, setOpenId] = useState<string | null>(searchParams.get('race'))
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
          was uploaded twice, once for each of its races. Speed against the
          polar, the wind, and the Crossover Chart&rsquo;s opinion of the sails
          are all worked out when the row loads; none of it is stored.
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

/** Testimony, worn as chips by the title. Missing is a chip too, and looks it. */
function Chip({
  children,
  missing,
}: {
  children: React.ReactNode
  missing?: boolean
}): React.ReactElement {
  return (
    <span
      style={{
        padding: '3px 9px', borderRadius: '999px',
        fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
        border: missing === true ? '1px dashed var(--surface-border)' : '1px solid var(--surface-border)',
        background: missing === true
          ? 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(0,0,0,0.04) 4px, rgba(0,0,0,0.04) 8px)'
          : 'var(--surface-elevated)',
        color: missing === true ? 'var(--text-muted)' : 'var(--text-primary)',
        fontStyle: missing === true ? 'italic' : 'normal',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}

function Field({
  label,
  value,
  onChange,
  mono = true,
}: {
  label: string
  value: string
  onChange: (next: string) => void
  mono?: boolean
}): React.ReactElement {
  return (
    <div style={{ marginBottom: '10px' }}>
      <Label>{label}</Label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%', padding: '9px 11px', borderRadius: 'var(--input-radius)',
          border: '1px solid var(--input-border)', background: 'var(--input-bg)',
          color: 'var(--input-fg)', fontSize: 'var(--text-sm)',
          fontFamily: mono ? 'var(--font-mono)' : 'var(--font-body)',
        }}
      />
    </div>
  )
}

function TextButton({
  label,
  onClick,
  danger,
}: {
  label: string
  onClick: () => void
  danger?: boolean
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
        fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600,
        color: danger === true ? 'var(--state-danger)' : 'var(--text-accent)',
      }}
    >
      {label}
    </button>
  )
}

function PencilButton({
  amending,
  onClick,
}: {
  amending: boolean
  onClick: () => void
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      aria-label={amending ? 'Stop amending' : 'Amend what we say happened'}
      title={amending ? 'Done' : 'Amend what we say happened'}
      style={{
        display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer',
        borderRadius: '999px', padding: '5px 10px',
        border: `1px solid ${amending ? 'var(--blue-500)' : 'var(--surface-border)'}`,
        background: amending ? 'var(--blue-muted)' : 'transparent',
        color: amending ? 'var(--text-accent)' : 'var(--text-secondary)',
        fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600,
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
      {amending ? 'Done' : 'Amend'}
    </button>
  )
}

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
  const stats = useMemo(() => quickStats(analysis), [analysis])
  const [amending, setAmending] = useState(false)
  const [title, setTitle] = useState(race.title ?? '')
  const [start, setStart] = useState(race.windowStart)
  const [finish, setFinish] = useState(race.windowFinish)
  const [confirmDelete, setConfirmDelete] = useState(false)
  /** One cursor, shared by both traces and the track. */
  const [cursor, setCursor] = useState<number | null>(null)
  const sog = useMemo(() => seriesOf(analysis.windowRows, analysis.windowQuality, 'sog'), [analysis])
  const tws = useMemo(() => seriesOf(analysis.windowRows, analysis.windowQuality, 'tws'), [analysis])
  const seaState = resolveSeaStateAt(race, race.windowStart)
  const refusal = checkWindow(race.recordingId, start, finish)
  const polarVersion = versionById(race.polarVersionId)
  const crossoverVersion = versionById(race.crossoverVersionId)

  return (
    <Sheet
      title={race.title ?? longDateOf(race.windowStart)}
      onClose={onClose}
      action={
        canWrite(viewer) ? (
          <PencilButton amending={amending} onClick={() => setAmending(!amending)} />
        ) : undefined
      }
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)',
          color: 'var(--text-secondary)', marginBottom: '8px',
        }}
      >
        {clockWithSecondsOf(race.windowStart)} → {clockWithSecondsOf(race.windowFinish)} ·{' '}
        {durationLabel(analysis.windowMinutes)}
      </div>

      {amending ? (
        <div
          style={{
            border: '1.5px solid var(--blue-500)', background: 'var(--blue-muted)',
            borderRadius: '10px', padding: '13px', marginBottom: '14px',
          }}
        >
          <p
            style={{
              margin: '0 0 12px', fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.45,
            }}
          >
            You are editing{' '}
            <strong style={{ color: 'var(--text-primary)' }}>what we say happened</strong>.
            The recording itself is not reachable from here, or from anywhere.
          </p>

          <Field label="Title · optional, never generated" value={title} onChange={setTitle} mono={false} />
          <Field label="Window start" value={start} onChange={setStart} />
          <Field label="Window finish" value={finish} onChange={setFinish} />

          {!refusal.ok && (
            <div
              style={{
                padding: '10px 12px', borderRadius: '6px',
                border: '1px solid var(--state-danger)',
                fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                color: 'var(--state-danger)', lineHeight: 1.45, marginBottom: '12px',
              }}
            >
              {refusal.reason}
            </div>
          )}

          <div style={{ marginBottom: '12px' }}>
            <Label>Sails</Label>
            {race.sailEntries.length === 0 ? (
              <NotRecorded label="No sail change written down" />
            ) : (
              race.sailEntries.map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    display: 'flex', alignItems: 'baseline', gap: '8px', padding: '4px 0',
                    fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <Mono>{clockOf(entry.at)}</Mono>
                  <span style={{ flex: 1 }}>{sailConfigLabel(entry)}</span>
                  <TextButton label="Edit" onClick={() => undefined} />
                  <TextButton label="Delete" onClick={() => undefined} danger />
                </div>
              ))
            )}
            <TextButton label="+ Add a sail change" onClick={() => undefined} />
          </div>

          <div style={{ marginBottom: '12px' }}>
            <Label>Sea State</Label>
            <div
              style={{
                display: 'flex', alignItems: 'baseline', gap: '8px',
                fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                color: 'var(--text-primary)',
              }}
            >
              <span style={{ flex: 1 }}>
                {seaState === null ? <NotRecorded /> : SEA_STATE_LABEL[seaState.seaState]}
              </span>
              <TextButton label={seaState === null ? '+ Record it' : 'Edit'} onClick={() => undefined} />
            </div>
          </div>

          <div style={{ marginBottom: '10px' }}>
            <Label>Setup in force · frozen pointers, repointable</Label>
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
                  display: 'flex', alignItems: 'baseline', gap: '8px', padding: '4px 0',
                  fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                  color: 'var(--text-secondary)',
                }}
              >
                <span style={{ flex: 1 }}>{label}</span>
                {versionById(id) ? (
                  <Mono>v{versionById(id)?.versionNumber}</Mono>
                ) : (
                  <NotRecorded />
                )}
                <TextButton label="Change" onClick={() => undefined} />
              </div>
            ))}
          </div>

          <p
            style={{
              margin: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
              color: 'var(--text-muted)', lineHeight: 1.45,
            }}
          >
            No change reason is asked for, no note is kept and there is no history
            to read: this is a memory, and a corrected memory is simply better.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
          {race.sailEntries.length === 0 ? (
            <Chip missing>No sails written down</Chip>
          ) : (
            race.sailEntries.map((entry) => (
              <Chip key={entry.id}>
                {clockOf(entry.at)} {sailConfigLabel(entry)}
              </Chip>
            ))
          )}
          {seaState === null ? (
            <Chip missing>No sea state</Chip>
          ) : (
            <Chip>{SEA_STATE_LABEL[seaState.seaState]}</Chip>
          )}
          {(
            [
              ['Polar', race.polarVersionId],
              ['Crossover', race.crossoverVersionId],
              ['Rig Tune', race.rigTuneVersionId],
              ['Cal', race.calibrationVersionId],
            ] as const
          ).map(([label, id]) =>
            versionById(id) ? (
              <Chip key={label}>
                {label} v{versionById(id)?.versionNumber}
              </Chip>
            ) : (
              <Chip key={label} missing>
                No {label}
              </Chip>
            )
          )}
        </div>
      )}

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

      <TrackMap
        rows={analysis.windowRows}
        quality={analysis.windowQuality}
        highlight={cursor}
        cadenceSec={analysis.cadenceSec}
      />

      <div style={{ marginTop: '16px' }}>
        <Label>Speed over the ground</Label>
        <TraceChart
          series={sog}
          unit="kt"
          interactive
          highlight={cursor}
          onHover={setCursor}
          quality={analysis.windowQuality}
        />
      </div>
      <div style={{ marginTop: '14px' }}>
        <Label>True wind speed · computed upstream, not measured</Label>
        <TraceChart
          series={tws}
          unit="kt"
          color="var(--wind-heavy)"
          interactive
          highlight={cursor}
          onHover={setCursor}
          quality={analysis.windowQuality}
        />
      </div>
      {stats.wind.averageTws !== null && (
        <div
          style={{
            marginTop: '8px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)',
            color: 'var(--text-secondary)',
          }}
        >
          {stats.wind.averageTws.toFixed(1)} kt average, {stats.wind.minTws?.toFixed(1)}–
          {stats.wind.maxTws?.toFixed(1)} range
          {stats.wind.averageTwd !== null && stats.wind.shiftDegrees !== null && (
            <>
              {' '}
              · {Math.round(stats.wind.averageTwd)}° mean, {Math.round(stats.wind.shiftDegrees)}°
              of shift
            </>
          )}
        </div>
      )}
      <p
        style={{
          margin: '6px 0 0', fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
          color: 'var(--text-muted)', lineHeight: 1.4,
        }}
      >
        Drag either trace: both traces and the track move together, so a slow
        patch can be found on the course rather than only on a clock.
      </p>

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
        <div style={{ marginTop: '10px' }}>
          <ProvenanceSentence text={analysis.provenanceSentence} />
        </div>
      </div>

      <div
        style={{
          marginTop: '20px', border: '1px solid var(--surface-border)', borderRadius: '10px',
          padding: '14px', background: 'var(--surface-elevated)',
        }}
      >
        <div
          style={{
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
            marginBottom: '10px',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-display)', fontSize: 'var(--text-base)', fontWeight: 700,
              color: 'var(--text-primary)',
            }}
          >
            Against the polar
          </span>
          {polarVersion !== undefined && <Mono>v{polarVersion.versionNumber}</Mono>}
        </div>

        {stats.polar.averagePercent === null ? (
          <NotRecorded label="Nothing here could be compared to a polar" />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
            <Stat value={`${stats.polar.averagePercent.toFixed(0)}%`} label="overall" />
            {stats.polar.upwindPercent === null ? (
              <Stat value="—" label="upwind" muted />
            ) : (
              <Stat value={`${stats.polar.upwindPercent.toFixed(0)}%`} label="upwind" />
            )}
            {stats.polar.downwindPercent === null ? (
              <Stat value="—" label="downwind" muted />
            ) : (
              <Stat value={`${stats.polar.downwindPercent.toFixed(0)}%`} label="downwind" />
            )}
          </div>
        )}

        <p
          style={{
            margin: '10px 0 0', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
            color: 'var(--text-secondary)', lineHeight: 1.45,
          }}
        >
          Scored over {spanLabel(stats.polar.scoredSeconds)} of{' '}
          {durationLabel(analysis.windowMinutes)}.
          {stats.polar.skipped.length > 0 && (
            <>
              {' '}
              The rest went unscored:{' '}
              {stats.polar.skipped
                .map((s) => `${spanLabel(s.seconds)} ${POLAR_SKIP_LABEL[s.reason]}`)
                .join('; ')}
              .
            </>
          )}
        </p>
        <p
          style={{
            margin: '8px 0 0', fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)', lineHeight: 1.45,
          }}
        >
          Speed through the water, not over the ground, because a polar is
          water-referenced. The polar itself came off a certificate and has never
          been measured on this boat, so this is a comparison, not a grade.
        </p>
      </div>

      <div
        style={{
          marginTop: '14px', border: '1px solid var(--surface-border)', borderRadius: '10px',
          padding: '14px', background: 'var(--surface-elevated)',
        }}
      >
        <div
          style={{
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
            marginBottom: '8px',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-display)', fontSize: 'var(--text-base)', fontWeight: 700,
              color: 'var(--text-primary)',
            }}
          >
            Crossover Chart
          </span>
          {crossoverVersion !== undefined && <Mono>v{crossoverVersion.versionNumber}</Mono>}
        </div>

        {stats.crossover.status === 'no-sail-recorded' && (
          <NotRecorded label="No sails written down, so there is nothing to compare" />
        )}
        {stats.crossover.status === 'no-chart' && (
          <NotRecorded label="This race points at no Crossover Chart" />
        )}
        {stats.crossover.status === 'agrees' && (
          <p
            style={{
              margin: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
              color: 'var(--text-secondary)', lineHeight: 1.45,
            }}
          >
            The chart called for the sails that were up, across the{' '}
            {spanLabel(stats.crossover.checkedSeconds)} it could be checked
            {stats.crossover.uncheckedSeconds > 0 ? (
              <>
                {' '}
                — {spanLabel(stats.crossover.uncheckedSeconds)} could not be checked,
                because a chart is read against true wind and true wind was not a
                real figure there
              </>
            ) : null}
            .
          </p>
        )}
        {stats.crossover.status === 'disagrees' && stats.crossover.dominant && (
          <p
            style={{
              margin: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
              color: 'var(--text-secondary)', lineHeight: 1.45,
            }}
          >
            The chart disagrees with{' '}
            <span style={{ color: 'var(--wind-heavy)' }}>
              {spanLabel(stats.crossover.disagreementSeconds)}
            </span>{' '}
            of the {spanLabel(stats.crossover.checkedSeconds)} it could check — most
            of the race. Two lines in the log cannot describe{' '}
            {spanLabel(analysis.windowMinutes * 60)} of racing, so read this as{' '}
            <em>the sails on record do not track this race</em>, not as two hours
            spent under the wrong sail. Listing every span would repeat one fact{' '}
            {stats.crossover.spans.length} times.
          </p>
        )}
        {stats.crossover.status === 'disagrees' && !stats.crossover.dominant && (
          <>
            {stats.crossover.spans.map((span) => (
              <div
                key={span.fromTime}
                style={{
                  padding: '7px 0', borderBottom: '1px solid var(--surface-divider)',
                  fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                  color: 'var(--text-primary)', lineHeight: 1.45,
                }}
              >
                <Mono>
                  {clockOf(span.fromTime)}–{clockOf(span.toTime)}
                </Mono>{' '}
                <span style={{ color: 'var(--wind-heavy)' }}>{spanLabel(span.seconds)}</span> ·
                carried {span.carried}, chart calls {span.called}
                {span.calledRetired && (
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {' '}
                    — a sail already off the boat by this race
                  </span>
                )}
              </div>
            ))}
            <p
              style={{
                margin: '10px 0 0', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                color: 'var(--text-secondary)', lineHeight: 1.45,
              }}
            >
              Either a sail change went unrecorded, or the chart is wrong for this
              boat. Layline cannot tell which and does not guess — except where the
              chart asks for a sail that had already left the inventory, which
              settles it. Stretches under 90 s are left out, because a chart
              boundary crossed twice is not a decision.
              {stats.crossover.uncheckedSeconds > 0 && (
                <>
                  {' '}
                  {spanLabel(stats.crossover.uncheckedSeconds)} of the window was not
                  checked at all: a chart is read against true wind, and true wind
                  was not a real figure there.
                </>
              )}
            </p>
          </>
        )}
      </div>

      <div style={{ marginTop: '18px' }}>
        <Seam>
          <strong style={{ color: 'var(--text-primary)' }}>Still missing:</strong> every
          tack and its cost, which side of the beat paid, VMG against the
          heading, this race set beside the others. What is above the line is
          arithmetic over one file and one memory — no model, no fleet, no
          judgement about how the day was sailed.
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
    { value: String(summary.recordingCount), label: 'recordings' },
    { value: String(summary.sailUsage.length), label: 'sail configurations used' },
    { value: spanLabel(summary.frozenSeconds), label: 'of frozen feed' },
    { value: spanLabel(summary.notWaterReferencedSeconds), label: 'with no paddlewheel' },
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

const TABS: Tab[] = ['setup', 'races', 'overall']

export default function VariantB({ viewer }: { viewer: Viewer }): React.ReactElement {
  // `?tab=races` opens straight onto a section, so a screen can be linked to
  // rather than described. Prototype convenience only.
  const searchParams = useSearchParams()
  const requested = searchParams.get('tab')
  const [tab, setTab] = useState<Tab>(
    requested !== null && (TABS as string[]).includes(requested) ? (requested as Tab) : 'setup'
  )

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
