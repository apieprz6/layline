'use client'

/**
 * THROWAWAY — small shared atoms for the LAY-94 prototype.
 *
 * Deliberately atoms only (chip, button, field, note). No shared layout: each
 * variant is free to throw the whole page structure out, which is the point of
 * comparing them.
 */

import type { ReactNode } from 'react'
import {
  ALREADY_LOGGED,
  BOAT_SETUP,
  RECORDINGS,
  REEF_STATES,
  SAIL_INVENTORY,
  SEA_STATES,
  WIND_BANDS,
  costMeter,
  dropoutSeverity,
  fmtDuration,
  fmtWindow,
  pct,
  provenanceSentence,
  windowRefusals,
  windowView,
  type Draft,
  type Fixture,
} from './shared'

export function Chip({
  label,
  detail,
  selected,
  onClick,
  tone = 'blue',
}: {
  label: string
  detail?: string
  selected: boolean
  onClick: () => void
  tone?: 'blue' | 'green'
}) {
  const accent = tone === 'green' ? 'var(--wind-light)' : 'var(--blue-500)'
  return (
    <button
      onClick={onClick}
      style={{
        padding: '7px 10px',
        borderRadius: 6,
        border: `1px solid ${selected ? accent : 'var(--surface-border)'}`,
        background: selected ? (tone === 'green' ? 'rgba(0,122,82,0.10)' : 'var(--blue-muted)') : 'var(--surface-raised)',
        color: selected ? accent : 'var(--text-secondary)',
        fontSize: 12,
        fontWeight: selected ? 600 : 500,
        fontFamily: 'Inter,sans-serif',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 1,
        lineHeight: 1.2,
      }}
    >
      <span>{label}</span>
      {detail && <span style={{ fontSize: 9, opacity: 0.7, fontFamily: 'var(--font-mono)' }}>{detail}</span>}
    </button>
  )
}

export function Button({
  children,
  onClick,
  kind = 'primary',
  disabled,
  full,
}: {
  children: ReactNode
  onClick?: () => void
  kind?: 'primary' | 'ghost' | 'danger' | 'quiet'
  disabled?: boolean
  full?: boolean
}) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: 'var(--blue-500)', color: '#fff', border: '1px solid var(--blue-600)' },
    ghost: { background: 'var(--surface-raised)', color: 'var(--text-secondary)', border: '1px solid var(--surface-border)' },
    quiet: { background: 'transparent', color: 'var(--text-accent)', border: '1px solid transparent' },
    danger: { background: 'transparent', color: 'var(--state-danger)', border: '1px solid var(--surface-border)' },
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...styles[kind],
        padding: '10px 14px',
        borderRadius: 7,
        fontSize: 13,
        fontWeight: 600,
        fontFamily: 'Inter,sans-serif',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        width: full ? '100%' : undefined,
      }}
    >
      {children}
    </button>
  )
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 9.5,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
        fontWeight: 600,
        marginBottom: 5,
      }}
    >
      {children}
    </div>
  )
}

export function TimeInput({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (v: string) => void
  label?: string
}) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      {label && <Label>{label}</Label>}
      <input
        type="datetime-local"
        value={value}
        onChange={(e) => {
          costMeter.bump()
          onChange(e.target.value)
        }}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '8px 8px',
          borderRadius: 6,
          border: '1px solid var(--surface-border)',
          background: 'var(--surface-raised)',
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
        }}
      />
    </div>
  )
}

export function Note({
  tone,
  title,
  children,
}: {
  tone: 'info' | 'warn' | 'stop' | 'quiet'
  title?: string
  children: ReactNode
}) {
  const map = {
    info: { fg: 'var(--state-info)', bg: 'rgba(0,68,204,0.07)', bd: 'rgba(0,68,204,0.22)' },
    warn: { fg: 'var(--state-warning)', bg: 'rgba(196,112,0,0.09)', bd: 'rgba(196,112,0,0.28)' },
    stop: { fg: 'var(--state-danger)', bg: 'rgba(204,17,0,0.08)', bd: 'rgba(204,17,0,0.30)' },
    quiet: { fg: 'var(--text-muted)', bg: 'var(--surface-elevated)', bd: 'var(--surface-border)' },
  }[tone]
  return (
    <div
      style={{
        border: `1px solid ${map.bd}`,
        background: map.bg,
        borderRadius: 7,
        padding: '9px 10px',
        fontSize: 11.5,
        lineHeight: 1.45,
        color: 'var(--text-secondary)',
      }}
    >
      {title && (
        <div style={{ fontWeight: 700, color: map.fg, fontSize: 11, marginBottom: 3, letterSpacing: '0.02em' }}>{title}</div>
      )}
      {children}
    </div>
  )
}

export function Card({ children, pad = 12 }: { children: ReactNode; pad?: number }) {
  return (
    <div
      style={{
        background: 'var(--surface-raised)',
        border: '1px solid var(--surface-border)',
        borderRadius: 8,
        boxShadow: 'var(--shadow-sm)',
        padding: pad,
      }}
    >
      {children}
    </div>
  )
}

/** "Not recorded" must render visibly distinct from a recorded value. */
export function NotRecorded() {
  return (
    <span
      style={{
        fontFamily: 'Inter,sans-serif',
        fontSize: 11,
        fontStyle: 'italic',
        color: 'var(--text-muted)',
        background: 'repeating-linear-gradient(45deg, rgba(0,0,0,0.035) 0 4px, transparent 4px 8px)',
        padding: '1px 6px',
        borderRadius: 4,
        border: '1px dashed var(--surface-border)',
      }}
    >
      not recorded
    </span>
  )
}

export function SailPicker({
  selected,
  onToggle,
}: {
  selected: string[]
  onToggle: (key: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
      {SAIL_INVENTORY.map((s) => (
        <Chip
          key={s.key}
          label={s.label}
          selected={selected.includes(s.key)}
          onClick={() => {
            costMeter.bump()
            onToggle(s.key)
          }}
        />
      ))}
    </div>
  )
}

export function ReefPicker({ value, onChange }: { value: string | null; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 5 }}>
      {REEF_STATES.map((r) => (
        <Chip
          key={r.key}
          label={r.label}
          selected={value === r.key}
          onClick={() => {
            costMeter.bump()
            onChange(r.key)
          }}
        />
      ))}
    </div>
  )
}

export function SeaStatePicker({ value, onChange }: { value: string | null; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
      {SEA_STATES.map((s) => (
        <Chip
          key={s.key}
          label={s.label}
          detail={s.detail}
          tone="green"
          selected={value === s.key}
          onClick={() => {
            costMeter.bump()
            onChange(s.key)
          }}
        />
      ))}
    </div>
  )
}

/**
 * Four Version pickers, not five (ADR 0012), plus the Wind Band — which is only
 * offered once a Rig Tune Version is chosen, because the database enforces that
 * ordering and the UI should too rather than discovering it as an error.
 * Nothing is defaulted to the current Version.
 */
export function BoatSetupPickers({
  draft,
  patch,
}: {
  draft: Draft
  patch: (p: Partial<Draft>) => void
}) {
  const kinds = [
    { kind: 'polar' as const, field: 'polarVersionId' as const, label: 'Polar' },
    { kind: 'crossover_chart' as const, field: 'crossoverVersionId' as const, label: 'Crossover chart' },
    { kind: 'rig_tune' as const, field: 'rigTuneVersionId' as const, label: 'Rig tune' },
    { kind: 'instrument_calibration' as const, field: 'calibrationVersionId' as const, label: 'Instrument calibration' },
  ]
  const bands = draft.rigTuneVersionId ? (WIND_BANDS[draft.rigTuneVersionId] ?? []) : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {kinds.map(({ kind, field, label }) => (
        <div key={field}>
          <Label>{label}</Label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            <Chip
              label="Not recorded"
              selected={draft[field] === null}
              onClick={() => {
                costMeter.bump()
                patch({ [field]: null, ...(field === 'rigTuneVersionId' ? { windBandId: null } : {}) } as Partial<Draft>)
              }}
            />
            {BOAT_SETUP[kind].map((v) => (
              <Chip
                key={v.id}
                label={v.label}
                selected={draft[field] === v.id}
                onClick={() => {
                  costMeter.bump()
                  patch({ [field]: v.id } as Partial<Draft>)
                }}
              />
            ))}
          </div>
        </div>
      ))}

      <div style={{ opacity: draft.rigTuneVersionId ? 1 : 0.5 }}>
        <Label>Wind band the boat was set up for</Label>
        {!draft.rigTuneVersionId ? (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Choose a rig tune first — a band belongs to a version.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              <Chip label="Not recorded" selected={draft.windBandId === null} onClick={() => { costMeter.bump(); patch({ windBandId: null }) }} />
              {bands.map((b) => (
                <Chip
                  key={b.id}
                  label={b.label}
                  detail={b.isBase ? 'base tune' : undefined}
                  selected={draft.windBandId === b.id}
                  onClick={() => {
                    costMeter.bump()
                    patch({ windBandId: b.id })
                  }}
                />
              ))}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
              Not checked against the logged wind — a mismatch is a finding for the race page, not an error here.
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * What the window currently contains. The *wording* is shared on purpose — only
 * where and when a variant chooses to show it is under comparison.
 *
 * ADR 0009's four outcomes, in one place:
 *   Reject / Block  → windowRefusals(), rendered as `stop`
 *   Warn-and-confirm → the ≥20% dropout case, rendered as `warn`
 *   Note            → everything else, rendered plainly and never as an error
 */
export function QualityReadout({
  fixture,
  start,
  finish,
  terse,
}: {
  fixture: Fixture
  start: string
  finish: string
  terse?: boolean
}) {
  const refusals = windowRefusals(fixture, start, finish)
  const v = windowView(fixture, start, finish)
  const sev = dropoutSeverity(v)

  if (refusals.length > 0) {
    return (
      <Note tone="stop" title="Cannot be saved">
        {refusals[0].message}
      </Note>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Stat label="in window" value={v.rows.toLocaleString()} unit="rows" />
        <Stat label="length" value={fmtDuration(v.spanSeconds)} />
        {v.frozen > 0 && (
          <Stat label="feed dropped" value={pct(v.frozen, v.rows)} tone={sev === 'loud' ? 'warn' : 'muted'} />
        )}
        {v.notWater > 0 && <Stat label="wind from GPS" value={pct(v.notWater, v.rows)} />}
      </div>

      {sev === 'loud' && (
        <Note tone="warn" title="Over a fifth of this window is a dead feed">
          {v.frozen.toLocaleString()} of {v.rows.toLocaleString()} rows repeat the previous fix — the boat did not slow
          down, the instruments stopped talking. The longest run lasts {fmtDuration(v.longestDropoutSeconds)}. Saving is
          allowed; the race will say so on its page.
        </Note>
      )}
      {sev === 'note' && !terse && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {v.frozen.toLocaleString()} rows in this window repeat the previous fix. Kept as recorded.
        </div>
      )}
      {v.tailGapSeconds > 0 && (
        <Note tone="info" title="The finish is past the last row">
          The recording stops {fmtDuration(v.tailGapSeconds)} before the finish you gave. That is allowed — the log died,
          the race did not.
        </Note>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  unit,
  tone = 'muted',
}: {
  label: string
  value: string
  unit?: string
  tone?: 'muted' | 'warn'
}) {
  return (
    <div>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 15,
          color: tone === 'warn' ? 'var(--state-warning)' : 'var(--text-primary)',
          lineHeight: 1.1,
        }}
      >
        {value}
        {unit && <span style={{ fontSize: 9.5, color: 'var(--text-muted)', marginLeft: 3 }}>{unit}</span>}
      </div>
      <div style={{ fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
        {label}
      </div>
    </div>
  )
}

/**
 * Prototype rule: surface the state. On submit every variant shows the exact
 * rows it would write, so "nothing is written until submit" (ADR 0010) is
 * visible rather than asserted, and a reviewer can see that the four Version
 * pointers really did stay null when nobody chose one.
 */
export function StateDump({ draft, onAgain }: { draft: Draft; onAgain: () => void }) {
  const f = draft.fixture
  if (!f) return null
  const v = windowView(f, draft.windowStart, draft.windowFinish)
  const rows: [string, string][] = [
    ['recordings', `1 row · id ${draft.recordingId} · sha256 ${f.sha256.slice(0, 12)}… · ${f.rowCount} rows`],
    ['recording_rows', `${f.rowCount} rows · ${f.sourceColumns.length} source columns, stored as given`],
    ['races', `1 row · window ${fmtWindow(draft.windowStart, draft.windowFinish)} · title ${draft.title || '(none)'}`],
    ['race_sail_entries', `${draft.sails.length} rows`],
    ['race_sea_state_entries', `${draft.seaState.length} rows`],
  ]
  const pointers: [string, string | null][] = [
    ['polar_version_id', draft.polarVersionId],
    ['crossover_chart_version_id', draft.crossoverVersionId],
    ['rig_tune_version_id', draft.rigTuneVersionId],
    ['instrument_calibration_version_id', draft.calibrationVersionId],
    ['rig_tune_band_id', draft.windBandId],
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Note tone="info" title="Submitted — this is everything that would be written">
        Up to this point the draft lived only in the browser. The bytes moved to storage under{' '}
        <code style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>recordings/{draft.recordingId}/{f.filename}</code>{' '}
        before any row was inserted, so a crash leaves orphaned bytes and never an orphaned row.
      </Note>
      <Card>
        {rows.map(([t, d]) => (
          <div key={t} style={{ display: 'flex', gap: 8, fontSize: 11, padding: '3px 0', borderBottom: '1px solid var(--surface-border)' }}>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-accent)', minWidth: 128 }}>{t}</span>
            <span style={{ color: 'var(--text-secondary)' }}>{d}</span>
          </div>
        ))}
        <div style={{ marginTop: 8 }}>
          <Label>Version pointers on the race</Label>
          {pointers.map(([k, val]) => (
            <div key={k} style={{ display: 'flex', gap: 8, fontSize: 10.5, padding: '2px 0', alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', minWidth: 190 }}>{k}</span>
              {val ? <span style={{ fontFamily: 'var(--font-mono)' }}>{val}</span> : <NotRecorded />}
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <Label>The one sentence the race page will carry</Label>
        <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--text-secondary)' }}>{provenanceSentence(f, v)}</div>
      </Card>
      <Button kind="ghost" full onClick={onAgain}>
        Log another
      </Button>
    </div>
  )
}

/**
 * Stand-in for the file chooser. Every variant needs to start from a file, so
 * the picking gesture itself is not what is being compared — the six fixtures
 * are listed with the hazard each one carries, so a reviewer can steer straight
 * at the hard cases.
 */
export function RecordingPicker({
  onPick,
  compact,
}: {
  onPick: (f: Fixture) => void
  compact?: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {RECORDINGS.map((f) => {
        const logged = ALREADY_LOGGED[f.filename]
        return (
          <button
            key={f.filename}
            onClick={() => {
              costMeter.reset()
              costMeter.bump()
              onPick(f)
            }}
            style={{
              textAlign: 'left',
              padding: compact ? '8px 10px' : '10px 12px',
              borderRadius: 7,
              border: '1px solid var(--surface-border)',
              background: 'var(--surface-raised)',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-primary)' }}>
                {f.filename}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {(f.bytes / 1024).toFixed(0)} KB · {f.rowCount} rows
              </span>
            </div>
            <span style={{ fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.35 }}>{f.why}</span>
            {logged && (
              <span style={{ fontSize: 10, color: 'var(--state-warning)', fontWeight: 600 }}>
                already logged as “{logged}”
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function TitleInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label>Title · optional</Label>
      <input
        value={value}
        placeholder="Leave blank if it does not need one"
        onChange={(e) => {
          costMeter.bump()
          onChange(e.target.value)
        }}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '9px 10px',
          borderRadius: 6,
          border: '1px solid var(--surface-border)',
          background: 'var(--surface-raised)',
          color: 'var(--text-primary)',
          fontSize: 13,
          fontFamily: 'Inter,sans-serif',
        }}
      />
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
        Never generated — a race with no title is shown by its date.
      </div>
    </div>
  )
}
