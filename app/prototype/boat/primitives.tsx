'use client'

/**
 * PROTOTYPE — throwaway. See ./README.md.
 *
 * Display primitives shared by the three variants. Deliberately *several
 * competing renderings* of the same artifact, so the variants can disagree
 * about which one belongs on a 390px screen — that is question 3. Layout and
 * navigation are not here; each variant owns its own.
 */

import React, { useMemo, useState } from 'react'
import {
  CHANNELS,
  CHANNEL_UNIT,
  SHROUD_LABEL,
  SHROUD_POSITIONS,
  clockOf,
  type CalibrationPayload,
  type CrossoverPayload,
  type PolarPayload,
  type RigTuneBand,
  type Row,
  type SailDefinition,
} from './fixture'
import {
  QUALITY_COLOR,
  QUALITY_LABEL,
  worstLabel,
  type Quality,
  type QualityLabel,
  type SeriesPoint,
  type Span,
} from './derive'

/** Angles below this are manufactured filler in the Polar; never rendered as data. */
export const POLAR_SUPPRESS_BELOW = 45

// ---------------------------------------------------------------------------
// Small shared bits
// ---------------------------------------------------------------------------

export function NotRecorded({ label = 'Not recorded' }: { label?: string }): React.ReactElement {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        fontFamily: 'var(--font-body)',
        fontSize: 'var(--text-sm)',
        fontStyle: 'italic',
        color: 'var(--text-muted)',
        background: 'repeating-linear-gradient(135deg, rgba(0,0,0,0.045) 0 4px, transparent 4px 8px)',
        border: '1px dashed var(--surface-border)',
        borderRadius: '4px',
        padding: '1px 6px',
      }}
    >
      {label}
    </span>
  )
}

export function Mono({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <span style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
      {children}
    </span>
  )
}

export function Label({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div
      style={{
        fontFamily: 'var(--font-body)',
        fontSize: 'var(--text-xs)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
        marginBottom: '4px',
      }}
    >
      {children}
    </div>
  )
}

export function Seam({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div
      style={{
        border: '1px dashed var(--surface-border-hover)',
        borderRadius: '8px',
        padding: '12px 14px',
        background:
          'repeating-linear-gradient(135deg, rgba(0,0,0,0.02) 0 6px, transparent 6px 12px)',
        fontFamily: 'var(--font-body)',
        fontSize: 'var(--text-sm)',
        color: 'var(--text-secondary)',
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  )
}

export function ProvenanceSentence({ text }: { text: string }): React.ReactElement {
  return (
    <p
      style={{
        margin: 0,
        fontFamily: 'var(--font-body)',
        fontSize: 'var(--text-sm)',
        lineHeight: 1.55,
        color: 'var(--text-muted)',
        borderLeft: '2px solid var(--surface-border)',
        paddingLeft: '10px',
      }}
    >
      {text}
    </p>
  )
}

// ---------------------------------------------------------------------------
// Polar — three competing renderings of 16 × 9
// ---------------------------------------------------------------------------

function speedColor(value: number, max: number): string {
  const t = Math.max(0, Math.min(1, value / max))
  // Teal → blue → amber, borrowed from the wind tokens rather than invented.
  if (t < 0.5) return `color-mix(in srgb, var(--wind-light) ${100 - t * 200}%, var(--wind-medium))`
  return `color-mix(in srgb, var(--wind-medium) ${100 - (t - 0.5) * 200}%, var(--wind-heavy))`
}

/** A: the whole grid, scrolled sideways, filler rows shown as what they are. */
export function PolarTable({ payload }: { payload: PolarPayload }): React.ReactElement {
  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <table
        style={{
          borderCollapse: 'collapse',
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <thead>
          <tr>
            <th
              style={{
                position: 'sticky', left: 0, zIndex: 1,
                background: 'var(--surface-elevated)', padding: '5px 7px',
                textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500,
                borderBottom: '1px solid var(--surface-border)',
              }}
            >
              twa/tws
            </th>
            {payload.twsAxis.map((tws) => (
              <th
                key={tws}
                style={{
                  padding: '5px 7px', color: 'var(--text-muted)', fontWeight: 500,
                  borderBottom: '1px solid var(--surface-border)',
                }}
              >
                {tws}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {payload.twaAxis.map((twa, r) => {
            const filler = twa < POLAR_SUPPRESS_BELOW
            return (
              <tr key={twa}>
                <th
                  style={{
                    position: 'sticky', left: 0, zIndex: 1,
                    background: 'var(--surface-raised)', padding: '4px 7px',
                    textAlign: 'left', fontWeight: 600,
                    color: filler ? 'var(--text-muted)' : 'var(--text-primary)',
                    borderRight: '1px solid var(--surface-divider)',
                  }}
                >
                  {twa}°
                </th>
                {payload.boatSpeed[r].map((v, c) => (
                  <td
                    key={c}
                    style={{
                      padding: '4px 7px', textAlign: 'right',
                      color: filler ? 'var(--text-muted)' : 'var(--text-primary)',
                      textDecoration: filler ? 'line-through' : 'none',
                      background: filler ? 'rgba(0,0,0,0.03)' : 'transparent',
                    }}
                  >
                    {v.toFixed(1)}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
      <p
        style={{
          margin: '8px 0 0', fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-sm)', color: 'var(--text-muted)', lineHeight: 1.5,
        }}
      >
        The 30° and 35° rows are struck through because they are filler in the
        source file — 35° is exactly twice 30° in every column. They are stored
        as given and never read.
      </p>
    </div>
  )
}

/** B: a heat grid, tap a cell to read it. Reads the shape, not the numbers. */
export function PolarHeat({ payload }: { payload: PolarPayload }): React.ReactElement {
  const [picked, setPicked] = useState<{ r: number; c: number } | null>(null)
  const max = useMemo(
    () => Math.max(...payload.boatSpeed.slice(2).flat()),
    [payload]
  )

  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `34px repeat(${payload.twsAxis.length}, 1fr)`,
          gap: '2px',
        }}
      >
        <div />
        {payload.twsAxis.map((tws) => (
          <div
            key={tws}
            style={{
              fontFamily: 'var(--font-mono)', fontSize: '9px',
              color: 'var(--text-muted)', textAlign: 'center',
            }}
          >
            {tws}
          </div>
        ))}
        {payload.twaAxis.map((twa, r) => {
          const filler = twa < POLAR_SUPPRESS_BELOW
          return (
            <React.Fragment key={twa}>
              <div
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: '10px',
                  color: filler ? 'var(--text-muted)' : 'var(--text-secondary)',
                  textAlign: 'right', paddingRight: '4px', lineHeight: '18px',
                }}
              >
                {twa}°
              </div>
              {payload.boatSpeed[r].map((v, c) => {
                const active = picked?.r === r && picked?.c === c
                return (
                  <button
                    key={c}
                    onClick={() => setPicked(active ? null : { r, c })}
                    aria-label={`${twa} degrees, ${payload.twsAxis[c]} knots`}
                    style={{
                      height: '18px', border: active ? '1.5px solid var(--text-primary)' : 'none',
                      borderRadius: '2px', padding: 0, cursor: 'pointer',
                      background: filler
                        ? 'repeating-linear-gradient(135deg, rgba(0,0,0,0.10) 0 3px, transparent 3px 6px)'
                        : speedColor(v, max),
                    }}
                  />
                )
              })}
            </React.Fragment>
          )
        })}
      </div>
      <div
        style={{
          marginTop: '10px', fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', minHeight: '20px',
        }}
      >
        {picked === null ? (
          'Tap a cell. Hatched rows are the file’s filler angles.'
        ) : payload.twaAxis[picked.r] < POLAR_SUPPRESS_BELOW ? (
          <>
            <Mono>{payload.twaAxis[picked.r]}°</Mono> is filler — no target speed is read below{' '}
            {POLAR_SUPPRESS_BELOW}°.
          </>
        ) : (
          <>
            <Mono>{payload.twaAxis[picked.r]}°</Mono> at{' '}
            <Mono>{payload.twsAxis[picked.c]} kt</Mono> ·{' '}
            <strong>
              <Mono>{payload.boatSpeed[picked.r][picked.c].toFixed(1)} kt</Mono>
            </strong>{' '}
            target boat speed
          </>
        )}
      </div>
    </div>
  )
}

/** C: one wind speed at a time. No horizontal scroll, no colour coding. */
export function PolarByWind({ payload }: { payload: PolarPayload }): React.ReactElement {
  const [col, setCol] = useState(3)
  const rows = payload.twaAxis
    .map((twa, r) => ({ twa, speed: payload.boatSpeed[r][col] }))
    .filter((row) => row.twa >= POLAR_SUPPRESS_BELOW)
  const best = Math.max(...rows.map((r) => r.speed))

  return (
    <div>
      <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '8px' }}>
        {payload.twsAxis.map((tws, i) => (
          <button
            key={tws}
            onClick={() => setCol(i)}
            style={{
              flex: '0 0 auto', padding: '6px 10px', borderRadius: '999px',
              fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)',
              border: i === col ? '1.5px solid var(--blue-500)' : '1px solid var(--surface-border)',
              background: i === col ? 'var(--blue-muted)' : 'var(--surface-raised)',
              color: i === col ? 'var(--text-accent)' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            {tws} kt
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {rows.map((row) => (
          <div key={row.twa} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '38px', textAlign: 'right', fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-sm)', color: 'var(--text-secondary)',
              }}
            >
              {row.twa}°
            </div>
            <div style={{ flex: 1, height: '14px', background: 'var(--surface-elevated)', borderRadius: '2px' }}>
              <div
                style={{
                  width: `${(row.speed / best) * 100}%`, height: '100%',
                  background: 'var(--wind-medium)', borderRadius: '2px', opacity: 0.75,
                }}
              />
            </div>
            <div
              style={{
                width: '44px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)',
                color: 'var(--text-primary)',
              }}
            >
              {row.speed.toFixed(1)}
            </div>
          </div>
        ))}
      </div>
      <p
        style={{
          margin: '10px 0 0', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
          color: 'var(--text-muted)', lineHeight: 1.5,
        }}
      >
        Angles below {POLAR_SUPPRESS_BELOW}° are not shown: the file’s 30° and 35°
        rows are filler, and reading them produces nonsense.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Crossover Chart — the palette keys off the chart's own numbers, so it cannot
// drift out of sync with the sails: they are the same Version.
// ---------------------------------------------------------------------------

export function sailColor(definitions: SailDefinition[], number: number): string {
  const i = definitions.findIndex((d) => d.number === number)
  const hue = i < 0 ? 0 : Math.round((i / Math.max(1, definitions.length)) * 320)
  return `hsl(${hue} 58% ${i % 2 === 0 ? 62 : 48}%)`
}

export function CrossoverLegend({
  payload,
  usedNumbers,
}: {
  payload: CrossoverPayload
  usedNumbers: Set<number>
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {payload.sailDefinitions.map((def) => {
        const used = usedNumbers.has(def.number)
        return (
          <div key={def.number} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                width: '14px', height: '14px', borderRadius: '3px', flex: '0 0 auto',
                background: sailColor(payload.sailDefinitions, def.number),
                opacity: used ? 1 : 0.35,
                border: used ? 'none' : '1px dashed var(--surface-border-hover)',
              }}
            />
            <span
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)',
                color: 'var(--text-muted)', width: '14px',
              }}
            >
              {def.number}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                color: used ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
            >
              {def.label}
            </span>
            {!used && (
              <span
                style={{
                  fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
                  fontStyle: 'italic', color: 'var(--text-muted)',
                }}
              >
                never called for
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** A/B: the whole 26 × 13 matrix, one colour per the chart's own sail number. */
export function CrossoverMatrix({ payload }: { payload: CrossoverPayload }): React.ReactElement {
  const [picked, setPicked] = useState<{ r: number; c: number } | null>(null)
  const used = useMemo(() => new Set(payload.cells.flat()), [payload])

  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `30px repeat(${payload.twsAxis.length}, 1fr)`,
          gap: '1px',
        }}
      >
        <div />
        {payload.twsAxis.map((tws) => (
          <div
            key={tws}
            style={{
              fontFamily: 'var(--font-mono)', fontSize: '8px',
              color: 'var(--text-muted)', textAlign: 'center',
            }}
          >
            {tws}
          </div>
        ))}
        {payload.twaAxis.map((twa, r) => (
          <React.Fragment key={twa}>
            <div
              style={{
                fontFamily: 'var(--font-mono)', fontSize: '9px',
                color: 'var(--text-muted)', textAlign: 'right',
                paddingRight: '3px', lineHeight: '13px',
              }}
            >
              {twa}
            </div>
            {payload.cells[r].map((n, c) => {
              const active = picked?.r === r && picked?.c === c
              return (
                <button
                  key={c}
                  onClick={() => setPicked(active ? null : { r, c })}
                  aria-label={`${twa} degrees, ${payload.twsAxis[c]} knots, sail ${n}`}
                  style={{
                    height: '13px', padding: 0, cursor: 'pointer', borderRadius: '1px',
                    border: active ? '1.5px solid var(--text-primary)' : 'none',
                    background: sailColor(payload.sailDefinitions, n),
                  }}
                />
              )
            })}
          </React.Fragment>
        ))}
      </div>

      <div
        style={{
          margin: '10px 0', fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', minHeight: '20px',
        }}
      >
        {picked === null ? (
          'Tap a cell to read what the chart calls for.'
        ) : (
          <>
            <Mono>
              {payload.twaAxis[picked.r]}° · {payload.twsAxis[picked.c]} kt
            </Mono>{' '}
            → <strong>
              {payload.sailDefinitions.find((d) => d.number === payload.cells[picked.r][picked.c])
                ?.label}
            </strong>{' '}
            <span style={{ color: 'var(--text-muted)' }}>
              (this chart’s sail {payload.cells[picked.r][picked.c]})
            </span>
          </>
        )}
      </div>

      <CrossoverLegend payload={payload} usedNumbers={used} />
    </div>
  )
}

/** C: one wind speed, runs of angle collapsed into words. */
export function CrossoverRuns({ payload }: { payload: CrossoverPayload }): React.ReactElement {
  const [col, setCol] = useState(4)
  const runs = useMemo(() => {
    const out: { from: number; to: number; number: number }[] = []
    payload.twaAxis.forEach((twa, r) => {
      const n = payload.cells[r][col]
      const last = out[out.length - 1]
      if (last && last.number === n) last.to = twa
      else out.push({ from: twa, to: twa, number: n })
    })
    return out
  }, [payload, col])

  return (
    <div>
      <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '8px' }}>
        {payload.twsAxis.map((tws, i) => (
          <button
            key={tws}
            onClick={() => setCol(i)}
            style={{
              flex: '0 0 auto', padding: '6px 10px', borderRadius: '999px',
              fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)',
              border: i === col ? '1.5px solid var(--blue-500)' : '1px solid var(--surface-border)',
              background: i === col ? 'var(--blue-muted)' : 'var(--surface-raised)',
              color: i === col ? 'var(--text-accent)' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            {tws} kt
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {runs.map((run) => (
          <div
            key={`${run.from}-${run.number}`}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px',
              background: 'var(--surface-raised)', border: '1px solid var(--surface-border)',
              borderLeft: `4px solid ${sailColor(payload.sailDefinitions, run.number)}`,
              borderRadius: '6px',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 'var(--text-base)',
                color: 'var(--text-primary)', minWidth: '86px',
              }}
            >
              {run.from === run.to ? `${run.from}°` : `${run.from}–${run.to}°`}
            </span>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-base)' }}>
              {payload.sailDefinitions.find((d) => d.number === run.number)?.label}
            </span>
          </div>
        ))}
      </div>
      <p
        style={{
          margin: '10px 0 0', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
          color: 'var(--text-muted)', lineHeight: 1.5,
        }}
      >
        The numbers are this chart’s own — they are not the boat’s Sail
        Inventory, and they mean nothing outside the Version that defines them.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Rig Tune — bands are rows, and a Race points at one of them
// ---------------------------------------------------------------------------

export function bandLabel(band: RigTuneBand): string {
  return band.highKt === null ? `${band.lowKt}+ kt` : `${band.lowKt}–${band.highKt} kt`
}

export function RigTuneBands({
  bands,
  raceBandId = null,
}: {
  bands: RigTuneBand[]
  raceBandId?: string | null
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {bands.map((band) => (
        <div
          key={band.id}
          style={{
            border: band.isBase ? '1.5px solid var(--blue-500)' : '1px solid var(--surface-border)',
            borderRadius: '8px', padding: '10px 12px',
            background: band.id === raceBandId ? 'var(--blue-muted)' : 'var(--surface-raised)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '8px' }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 'var(--text-base)',
                fontWeight: 600, color: 'var(--text-primary)',
              }}
            >
              {bandLabel(band)}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                color: 'var(--text-muted)',
              }}
            >
              {band.label}
            </span>
            {band.isBase && (
              <span
                style={{
                  marginLeft: 'auto', fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  color: 'var(--text-accent)', fontWeight: 600,
                }}
              >
                Base tune
              </span>
            )}
            {band.highKt === null && !band.isBase && (
              <span
                style={{
                  marginLeft: 'auto', fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
                  letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)',
                }}
              >
                Open top
              </span>
            )}
          </div>

          <table
            style={{
              width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)',
              fontSize: '11px', fontVariantNumeric: 'tabular-nums',
            }}
          >
            <thead>
              <tr style={{ color: 'var(--text-muted)' }}>
                <th style={{ textAlign: 'left', fontWeight: 500, paddingBottom: '3px' }}>pos</th>
                <th style={{ textAlign: 'right', fontWeight: 500 }}>gap P</th>
                <th style={{ textAlign: 'right', fontWeight: 500 }}>gap S</th>
                <th style={{ textAlign: 'right', fontWeight: 500 }}>turns</th>
              </tr>
            </thead>
            <tbody>
              {SHROUD_POSITIONS.map((pos) => {
                const s = band.shrouds[pos]
                return (
                  <tr key={pos} style={{ borderTop: '1px solid var(--surface-divider)' }}>
                    <td style={{ padding: '3px 0', color: 'var(--text-secondary)' }}>
                      {SHROUD_LABEL[pos]}
                    </td>
                    <td style={{ textAlign: 'right', color: 'var(--text-primary)' }}>
                      {s.port.gapMm.toFixed(1)}
                    </td>
                    <td style={{ textAlign: 'right', color: 'var(--text-primary)' }}>
                      {s.starboard.gapMm.toFixed(1)}
                    </td>
                    <td style={{ textAlign: 'right', color: 'var(--text-primary)' }}>
                      {band.isBase
                        ? '—'
                        : `${s.port.turnsFromBase > 0 ? '+' : ''}${s.port.turnsFromBase.toFixed(1)}`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {band.note && (
            <p
              style={{
                margin: '8px 0 0', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                color: 'var(--text-muted)', lineHeight: 1.45,
              }}
            >
              {band.note}
            </p>
          )}
        </div>
      ))}
      <p
        style={{
          margin: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
          color: 'var(--text-muted)', lineHeight: 1.5,
        }}
      >
        Gaps are millimetres between the turnbuckle threads — smaller is tighter.
        Turns count off the Base Tune, whose gaps are the absolute ones. Neither
        figure derives from the other.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Instrument Calibration — current values
// ---------------------------------------------------------------------------

export function CalibrationValues({
  payload,
}: {
  payload: CalibrationPayload
}): React.ReactElement {
  return (
    <table
      style={{
        width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-sm)', fontVariantNumeric: 'tabular-nums',
      }}
    >
      <thead>
        <tr style={{ color: 'var(--text-muted)' }}>
          <th style={{ textAlign: 'left', fontWeight: 500, paddingBottom: '4px' }}>channel</th>
          <th style={{ textAlign: 'right', fontWeight: 500 }}>multiplier</th>
          <th style={{ textAlign: 'right', fontWeight: 500 }}>offset</th>
        </tr>
      </thead>
      <tbody>
        {CHANNELS.map((channel) => {
          const value = payload[channel]
          return (
            <tr key={channel} style={{ borderTop: '1px solid var(--surface-divider)' }}>
              <td style={{ padding: '6px 0', color: 'var(--text-primary)', fontWeight: 600 }}>
                {channel}
              </td>
              <td style={{ textAlign: 'right', color: 'var(--text-primary)' }}>
                {value.multiplier === undefined ? (
                  <span style={{ color: 'var(--text-muted)' }}>no multiplier</span>
                ) : (
                  value.multiplier.toFixed(2)
                )}
              </td>
              <td style={{ textAlign: 'right', color: 'var(--text-primary)' }}>
                {value.offset.toFixed(1)}
                {CHANNEL_UNIT[channel]}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ---------------------------------------------------------------------------
// Row Quality displays
// ---------------------------------------------------------------------------

export function QualityBar({
  counts,
  height = 8,
}: {
  counts: Record<QualityLabel, number>
  height?: number
}): React.ReactElement {
  const order: QualityLabel[] = ['ok', 'low-speed', 'not-water-referenced', 'frozen']
  const total = order.reduce((sum, k) => sum + counts[k], 0) || 1
  return (
    <div style={{ display: 'flex', height: `${height}px`, borderRadius: '2px', overflow: 'hidden' }}>
      {order.map((k) =>
        counts[k] === 0 ? null : (
          <div
            key={k}
            title={`${QUALITY_LABEL[k]}: ${counts[k]}`}
            style={{
              width: `${(counts[k] / total) * 100}%`,
              background: QUALITY_COLOR[k],
              opacity: k === 'ok' ? 0.45 : 0.9,
            }}
          />
        )
      )}
    </div>
  )
}

export function QualityKey({
  counts,
}: {
  counts: Record<QualityLabel, number>
}): React.ReactElement {
  const order: QualityLabel[] = ['ok', 'low-speed', 'not-water-referenced', 'frozen']
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
      {order.map((k) => (
        <span
          key={k}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
            color: counts[k] === 0 ? 'var(--text-muted)' : 'var(--text-secondary)',
          }}
        >
          <span
            style={{
              width: '9px', height: '9px', borderRadius: '2px',
              background: QUALITY_COLOR[k], opacity: counts[k] === 0 ? 0.3 : 1,
            }}
          />
          {QUALITY_LABEL[k]} <Mono>{counts[k]}</Mono>
        </span>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Traces and track. Frozen spans must never draw as a plausible flat line.
// ---------------------------------------------------------------------------

export function TraceChart({
  series,
  unit,
  height = 90,
  color = 'var(--wind-medium)',
}: {
  series: SeriesPoint[]
  unit: string
  height?: number
  color?: string
}): React.ReactElement {
  const width = 340
  const values = series.filter((p) => p.value !== null && !p.frozen).map((p) => p.value as number)
  const min = values.length > 0 ? Math.min(...values) : 0
  const max = values.length > 0 ? Math.max(...values) : 1
  const pad = (max - min) * 0.15 || 0.5
  const lo = min - pad
  const hi = max + pad
  const x = (i: number): number => (series.length <= 1 ? 0 : (i / (series.length - 1)) * width)
  const y = (v: number): number => height - ((v - lo) / (hi - lo)) * height

  // Live segments only: a frozen or missing sample breaks the line.
  const segments: string[] = []
  let current: string[] = []
  series.forEach((p, i) => {
    if (p.value === null || p.frozen) {
      if (current.length > 1) segments.push(current.join(' '))
      current = []
      return
    }
    current.push(`${current.length === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`)
  })
  if (current.length > 1) segments.push(current.join(' '))

  const frozenBands: { from: number; to: number }[] = []
  let start: number | null = null
  series.forEach((p, i) => {
    if (p.frozen && start === null) start = i
    if (!p.frozen && start !== null) {
      frozenBands.push({ from: start, to: i - 1 })
      start = null
    }
  })
  if (start !== null) frozenBands.push({ from: start, to: series.length - 1 })

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Trace in ${unit}`}
      >
        <defs>
          <pattern id="frozenHatch" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" fill="rgba(204,17,0,0.08)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--wind-storm)" strokeWidth="1.4" opacity="0.5" />
          </pattern>
        </defs>
        {frozenBands.map((band) => (
          <rect
            key={band.from}
            x={x(band.from)}
            y={0}
            width={Math.max(2, x(band.to) - x(band.from))}
            height={height}
            fill="url(#frozenHatch)"
          />
        ))}
        {segments.map((d, i) => (
          <path key={i} d={d} fill="none" stroke={color} strokeWidth="1.6" />
        ))}
      </svg>
      <div
        style={{
          display: 'flex', justifyContent: 'space-between',
          fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)',
        }}
      >
        <span>{series.length > 0 ? clockOf(series[0].time) : ''}</span>
        <span>
          {lo.toFixed(1)}–{hi.toFixed(1)} {unit}
        </span>
        <span>{series.length > 0 ? clockOf(series[series.length - 1].time) : ''}</span>
      </div>
    </div>
  )
}

export function TrackMap({
  rows,
  quality,
  height = 200,
}: {
  rows: Row[]
  quality: Quality[]
  height?: number
}): React.ReactElement {
  const points = rows
    .map((r, i) => ({ r, q: quality[i] }))
    .filter((p) => p.r.lat !== null && p.r.lon !== null)
  if (points.length === 0) {
    return <Seam>No position in this window.</Seam>
  }

  const lats = points.map((p) => p.r.lat as number)
  const lons = points.map((p) => p.r.lon as number)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLon = Math.min(...lons)
  const maxLon = Math.max(...lons)
  const width = 340
  const spanLat = maxLat - minLat || 1e-6
  const spanLon = maxLon - minLon || 1e-6
  const scale = Math.min(width / spanLon, height / spanLat) * 0.86
  const cx = width / 2
  const cy = height / 2
  const px = (lon: number): number => cx + (lon - (minLon + maxLon) / 2) * scale
  const py = (lat: number): number => cy - (lat - (minLat + maxLat) / 2) * scale

  const live: string[] = []
  let current: string[] = []
  const frozenMarks: { x: number; y: number }[] = []
  points.forEach((p) => {
    const X = px(p.r.lon as number)
    const Y = py(p.r.lat as number)
    if (p.q.frozen) {
      if (current.length > 1) live.push(current.join(' '))
      current = []
      frozenMarks.push({ x: X, y: Y })
      return
    }
    current.push(`${current.length === 0 ? 'M' : 'L'}${X.toFixed(1)},${Y.toFixed(1)}`)
  })
  if (current.length > 1) live.push(current.join(' '))

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label="Track over the ground"
        style={{ background: 'var(--chart-bg-mid)', borderRadius: '6px' }}
      >
        {live.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="var(--blue-500)" strokeWidth="1.6" />
        ))}
        {frozenMarks.length > 0 && (
          <>
            <circle
              cx={frozenMarks[0].x}
              cy={frozenMarks[0].y}
              r={9}
              fill="none"
              stroke="var(--wind-storm)"
              strokeWidth="1.4"
              strokeDasharray="3 3"
            />
            <circle cx={frozenMarks[0].x} cy={frozenMarks[0].y} r={2.5} fill="var(--wind-storm)" />
          </>
        )}
      </svg>
      {frozenMarks.length > 0 && (
        <p
          style={{
            margin: '6px 0 0', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
            color: 'var(--wind-storm)', lineHeight: 1.45,
          }}
        >
          The circled fix is where the feed latched: {frozenMarks.length}{' '}
          {frozenMarks.length === 1 ? 'row' : 'rows'} inside this window repeat it
          verbatim. The track does not continue — it stops.
        </p>
      )}
    </div>
  )
}

export function RowTable({
  rows,
  quality,
  limit = 12,
}: {
  rows: Row[]
  quality: Quality[]
  limit?: number
}): React.ReactElement {
  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? rows : rows.slice(0, limit)

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: '11px',
            fontVariantNumeric: 'tabular-nums', width: '100%',
          }}
        >
          <thead>
            <tr style={{ color: 'var(--text-muted)' }}>
              {['time', 'sog', 'stw', 'tws', 'twa', 'quality'].map((h) => (
                <th key={h} style={{ textAlign: 'left', fontWeight: 500, padding: '3px 6px 5px 0' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, i) => {
              const label = worstLabel(quality[i])
              return (
                <tr key={row.index} style={{ borderTop: '1px solid var(--surface-divider)' }}>
                  <td style={{ padding: '3px 6px 3px 0', color: 'var(--text-secondary)' }}>
                    {clockOf(row.time)}
                  </td>
                  {([row.sog, row.stw, row.tws, row.twa] as (number | null)[]).map((v, k) => (
                    <td key={k} style={{ padding: '3px 6px 3px 0', color: 'var(--text-primary)' }}>
                      {v === null ? (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      ) : (
                        v.toFixed(1)
                      )}
                    </td>
                  ))}
                  <td
                    style={{
                      padding: '3px 0', color: label === 'ok' ? 'var(--text-muted)' : QUALITY_COLOR[label],
                      fontWeight: label === 'ok' ? 400 : 600,
                    }}
                  >
                    {label === 'ok' ? '' : QUALITY_LABEL[label]}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <button
          onClick={() => setShowAll(!showAll)}
          style={{
            marginTop: '8px', background: 'transparent', border: 'none', padding: 0,
            fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
            color: 'var(--text-accent)', cursor: 'pointer',
          }}
        >
          {showAll ? 'Show fewer rows' : `Show all ${rows.length} rows`}
        </button>
      )}
    </div>
  )
}

export function SpanList({ spans, kind }: { spans: Span[]; kind: string }): React.ReactElement {
  if (spans.length === 0) return <></>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
      {spans.map((span) => (
        <div
          key={span.fromIndex}
          style={{
            fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
            color: 'var(--text-secondary)',
          }}
        >
          {kind} <Mono>{clockOf(span.fromTime)}</Mono>–<Mono>{clockOf(span.toTime)}</Mono>{' '}
          <span style={{ color: 'var(--text-muted)' }}>
            ({span.toIndex - span.fromIndex + 1} rows)
          </span>
        </div>
      ))}
    </div>
  )
}
