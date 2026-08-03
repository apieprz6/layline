'use client'

import React from 'react'
import { useTheme } from '@/lib/hooks/useTheme'
import type { ThemePreference } from '@/types'

const themeOptions: { value: ThemePreference; label: string; subtitle?: string }[] = [
  {
    value: 'auto',
    label: 'Auto',
    subtitle: 'Switches at civil twilight for Navy Pier',
  },
  {
    value: 'solar',
    label: 'Solar',
  },
  {
    value: 'nightvision',
    label: 'Night Vision',
  },
]

export default function SettingsPage(): React.ReactElement {
  const { preference, setPreference } = useTheme()

  return (
    <div style={{ padding: '24px 16px', maxWidth: '480px' }}>
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-xl)',
          fontWeight: 'var(--weight-bold)',
          color: 'var(--text-primary)',
          margin: '0 0 24px',
        }}
      >
        Settings
      </h1>

      <section>
        <h2
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-base)',
            fontWeight: 'var(--weight-semibold)',
            color: 'var(--text-secondary)',
            margin: '0 0 12px',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          Theme
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {themeOptions.map((option) => {
            const isActive = preference === option.value
            return (
              <button
                key={option.value}
                onClick={() => setPreference(option.value)}
                aria-pressed={isActive}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '14px 16px',
                  borderRadius: '8px',
                  border: isActive
                    ? '1.5px solid var(--accent, var(--blue-500))'
                    : '1px solid var(--surface-border)',
                  background: isActive
                    ? 'var(--blue-muted)'
                    : 'var(--surface-raised)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                  transition: 'all 150ms',
                }}
              >
                <span
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    border: isActive
                      ? '6px solid var(--accent, var(--blue-500))'
                      : '2px solid var(--text-muted)',
                    flexShrink: 0,
                  }}
                />
                <span style={{ flex: 1 }}>
                  <span
                    style={{
                      display: 'block',
                      fontFamily: 'var(--font-body)',
                      fontSize: 'var(--text-base)',
                      fontWeight: isActive ? 'var(--weight-semibold)' : 'var(--weight-medium)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {option.label}
                  </span>
                  {option.subtitle && (
                    <span
                      style={{
                        display: 'block',
                        fontFamily: 'var(--font-body)',
                        fontSize: 'var(--text-sm)',
                        color: 'var(--text-muted)',
                        marginTop: '2px',
                      }}
                    >
                      {option.subtitle}
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}
