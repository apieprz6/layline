'use client'

import { useEffect, type ReactElement, type ReactNode } from 'react'
import { spacing } from '@/lib/utils/design'
import { CAVEATS, CHANNEL_TITLES, type Channel } from './data'

/**
 * PROTOTYPE ONLY — the bottom sheet ADR 0031 settled, plus the small furniture every variant
 * draws charts with. The sheet is shared because it is already decided; what goes *in* it is the
 * variant's alone.
 */
export function Sheet({
  channel,
  onClose,
  children,
}: {
  channel: Channel
  onClose: () => void
  children: ReactNode
}): ReactElement {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const title = CHANNEL_TITLES[channel]
  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 190 }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${title.label} — the measurement behind the figure`}
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 200,
          maxWidth: 430,
          margin: '0 auto',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'var(--surface-raised)',
          borderTop: '1px solid var(--surface-border)',
          borderRadius: '16px 16px 0 0',
          boxShadow: '0 -8px 32px rgba(0,0,0,0.18)',
          padding: `10px ${spacing(4)} calc(${spacing(8)} + env(safe-area-inset-bottom))`,
        }}
      >
        <div
          style={{
            width: 40,
            height: 4,
            borderRadius: 9999,
            background: 'var(--surface-border)',
            margin: '0 auto 12px',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <h2
              style={{
                margin: 0,
                fontFamily: 'var(--font-display)',
                fontSize: 16,
                fontWeight: 700,
                color: 'var(--text-primary)',
                letterSpacing: '-0.02em',
              }}
            >
              {title.label}
            </h2>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9.5,
                color: channel === 'awa' ? 'var(--state-warning)' : 'var(--text-muted)',
                marginTop: 3,
              }}
            >
              {title.term}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              flexShrink: 0,
              alignSelf: 'flex-start',
              width: 28,
              height: 28,
              borderRadius: 9999,
              border: '1px solid var(--surface-border)',
              background: 'transparent',
              color: 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ marginTop: spacing(3) }}>{children}</div>
        <p
          style={{
            margin: `${spacing(3)} 0 0`,
            paddingTop: spacing(3),
            borderTop: '1px solid var(--surface-divider)',
            fontSize: 10.5,
            lineHeight: 1.55,
            color: 'var(--text-muted)',
            fontStyle: 'italic',
          }}
        >
          {CAVEATS[channel]}
        </p>
      </div>
    </>
  )
}

export function Caption({ children }: { children: ReactNode }): ReactElement {
  return (
    <p
      style={{
        margin: `${spacing(2)} 0 0`,
        fontSize: 10.5,
        lineHeight: 1.55,
        color: 'var(--text-secondary)',
      }}
    >
      {children}
    </p>
  )
}

export function Stat({ label, value, tone }: { label: string; value: string; tone?: string }): ReactElement {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: tone ?? 'var(--text-primary)' }}>
        {value}
      </div>
      <div style={{ fontSize: 8.5, color: 'var(--text-muted)', marginTop: 1 }}>{label}</div>
    </div>
  )
}

export function StatRow({ children }: { children: ReactNode }): ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        gap: spacing(4),
        flexWrap: 'wrap',
        marginTop: spacing(3),
        paddingTop: spacing(2),
        borderTop: '1px solid var(--surface-divider)',
      }}
    >
      {children}
    </div>
  )
}

export function Eyebrow({ children }: { children: ReactNode }): ReactElement {
  return (
    <div
      style={{
        fontSize: 9.5,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
        margin: `${spacing(3)} 0 ${spacing(1)}`,
      }}
    >
      {children}
    </div>
  )
}

/** A segmented control. Two to four options; the selected one is filled, never colour-only. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { key: T; label: string }[]
  value: T
  onChange: (key: T) => void
}): ReactElement {
  return (
    <div
      role="radiogroup"
      style={{
        display: 'flex',
        border: '1px solid var(--surface-border)',
        borderRadius: 9999,
        padding: 2,
        gap: 2,
        overflowX: 'auto',
      }}
    >
      {options.map((option) => {
        const on = option.key === value
        return (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(option.key)}
            style={{
              flex: '1 0 auto',
              border: 'none',
              borderRadius: 9999,
              padding: '5px 9px',
              fontSize: 10.5,
              fontWeight: on ? 700 : 500,
              background: on ? 'var(--text-primary)' : 'transparent',
              color: on ? 'var(--text-inverse)' : 'var(--text-secondary)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/** The hatch every variant uses for "nothing here", matching NotRecorded's diagonal. */
export function HatchDef({ id }: { id: string }): ReactElement {
  return (
    <defs>
      <pattern id={id} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="5" stroke="var(--text-muted)" strokeWidth="1" opacity="0.35" />
      </pattern>
    </defs>
  )
}
