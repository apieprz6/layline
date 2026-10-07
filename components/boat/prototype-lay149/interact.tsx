'use client'

import type { MouseEvent, ReactElement, ReactNode } from 'react'

/**
 * PROTOTYPE — LAY-149 variant D's interaction furniture. Tap targets on a 390px chart are a few
 * pixels wide, so charts hit-test the tap position themselves (a heading bin, a speed band) rather
 * than asking a finger to land on a 9px rect.
 */

/** The tap position in the SVG's own viewBox coordinates. */
export function svgPoint(event: MouseEvent<SVGSVGElement>): { x: number; y: number } {
  const svg = event.currentTarget
  const matrix = svg.getScreenCTM()
  if (!matrix) return { x: 0, y: 0 }
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
  return { x: point.x, y: point.y }
}

export interface ChipOption {
  id: string
  label: string
  /** Shown in the readout when a disabled chip is tapped — absence is said, not hidden. */
  disabledReason?: string
}

export function Chips({
  options,
  value,
  onChange,
}: {
  options: readonly ChipOption[]
  value: string
  onChange: (id: string) => void
}): ReactElement {
  return (
    <div style={{ display: 'flex', gap: 4, overflowX: 'auto', padding: '2px 0 6px' }}>
      {options.map((o) => {
        const on = o.id === value
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.id)}
            style={{
              flexShrink: 0,
              border: `1px ${o.disabledReason ? 'dashed' : 'solid'} var(--surface-border)`,
              borderRadius: 9999,
              padding: '5px 10px',
              fontSize: 10.5,
              background: on ? 'var(--text-primary)' : 'transparent',
              color: on ? 'var(--text-inverse)' : o.disabledReason ? 'var(--text-muted)' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** The panel under a chart that says what is selected. Always present, so the layout never jumps. */
export function Readout({ children }: { children: ReactNode }): ReactElement {
  return (
    <div
      aria-live="polite"
      style={{
        marginTop: 8,
        background: 'var(--surface-elevated)',
        border: '1px solid var(--surface-border)',
        borderRadius: 8,
        padding: '8px 10px',
        minHeight: 64,
        fontSize: 11,
        lineHeight: 1.5,
        color: 'var(--text-secondary)',
      }}
    >
      {children}
    </div>
  )
}

export function Big({ children, tone }: { children: ReactNode; tone?: string }): ReactElement {
  return (
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, color: tone ?? 'var(--text-primary)', lineHeight: 1.3 }}>
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ fits */

export type FitMethod = 'orthogonal' | 'ols'

export interface Line {
  slope: number
  intercept: number
  r2: number
  /** Weighted mean of SOG − STW: the knot gap ADR 0027 reports. */
  bias: number
}

/**
 * Weighted line through (STW, SOG). `ols` regresses SOG on STW (ADR 0027 as written); `orthogonal`
 * treats both instruments as noisy, which is what they are. The coefficients exist only to draw
 * the line — the prototype never prints them (LAY-138 decision 7).
 */
export function fitLine(points: readonly [number, number][], weights: readonly number[], method: FitMethod): Line | null {
  if (points.length < 5) return null
  let sw = 0
  let mx = 0
  let my = 0
  points.forEach(([x, y], i) => {
    sw += weights[i]
    mx += weights[i] * x
    my += weights[i] * y
  })
  mx /= sw
  my /= sw
  let sxx = 0
  let syy = 0
  let sxy = 0
  let gap = 0
  points.forEach(([x, y], i) => {
    sxx += weights[i] * (x - mx) ** 2
    syy += weights[i] * (y - my) ** 2
    sxy += weights[i] * (x - mx) * (y - my)
    gap += weights[i] * (y - x)
  })
  if (sxx === 0 || syy === 0 || sxy === 0) return null
  const slope =
    method === 'ols' ? sxy / sxx : (syy - sxx + Math.sqrt((syy - sxx) ** 2 + 4 * sxy ** 2)) / (2 * sxy)
  return { slope, intercept: my - slope * mx, r2: (sxy * sxy) / (sxx * syy), bias: gap / sw }
}
