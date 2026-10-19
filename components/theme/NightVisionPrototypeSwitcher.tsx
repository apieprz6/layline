'use client'

/**
 * 🚧 PROTOTYPE — throwaway. Never merge to main.
 *
 * Four night vision palettes, switched on <html data-nv="A|B|C|D">, over the real app. The
 * variant lives in `?nv=` and in sessionStorage, so it survives navigating between screens.
 * Variant A is the current theme; B–D are in `app/nightvision-prototype.css`.
 */

import { useCallback, useEffect, useState } from 'react'
import { setThemePreference } from '@/lib/theme/store'
import { useTheme } from '@/lib/hooks/useTheme'

const VARIANTS = [
  { key: 'A', name: 'Current — strict red' },
  { key: 'B', name: 'Red only, contrast fixed' },
  { key: 'C', name: 'Red + amber' },
  { key: 'D', name: 'Amber type, red ink' },
] as const

type VariantKey = (typeof VARIANTS)[number]['key']

const STORAGE_KEY = 'layline-nv-prototype'
const DIM_KEY = 'layline-nv-prototype-dim'
const SIGNAL_KEY = 'layline-nv-prototype-signal'
const BLUE_KEY = 'layline-nv-prototype-blue'
const SPEED_KEY = 'layline-nv-prototype-speed'

/** The boat-speed ramp on the track, in both themes. `current` is daylight blue. */
const SPEED_RAMPS = ['current', 'violet', 'heat'] as const
type SpeedRamp = (typeof SPEED_RAMPS)[number]

function isSpeedRamp(value: string | null): value is SpeedRamp {
  return SPEED_RAMPS.some((ramp) => ramp === value)
}

const TOKENS = [
  '--text-primary',
  '--text-secondary',
  '--text-muted',
  '--accent',
  '--wind-light',
  '--wind-medium',
  '--wind-heavy',
  '--wind-storm',
  '--tack-port',
  '--tack-starboard',
  '--track-above-2',
  '--state-success',
  '--track-speed-5',
  '--trend-steady',
] as const

function isVariant(value: string | null): value is VariantKey {
  return VARIANTS.some((v) => v.key === value)
}

function channels(hex: string): [number, number, number] | null {
  const clean = hex.trim().replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null
  return [0, 2, 4].map((at) => parseInt(clean.substring(at, at + 2), 16)) as [number, number, number]
}

function luminance(hex: string): number | null {
  const rgb = channels(hex)
  if (!rgb) return null
  const [r, g, b] = rgb.map((c) => {
    const v = c / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number | null {
  const la = luminance(a)
  const lb = luminance(b)
  if (la === null || lb === null) return null
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

function grade(ratio: number | null): string {
  if (ratio === null) return '—'
  if (ratio >= 4.5) return 'AA'
  if (ratio >= 3) return 'large'
  return 'FAIL'
}

export default function NightVisionPrototypeSwitcher(): React.ReactElement {
  const { theme } = useTheme()
  const [variant, setVariant] = useState<VariantKey>('A')
  const [dim, setDim] = useState(100)
  const [open, setOpen] = useState(false)
  const [mini, setMini] = useState(false)
  const [signal, setSignal] = useState(false)
  const [blue, setBlue] = useState(false)
  const [speed, setSpeed] = useState<SpeedRamp>('current')
  const [readings, setReadings] = useState<{ token: string; value: string; ratio: number | null }[]>([])
  const [windSteps, setWindSteps] = useState<(number | null)[]>([])

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('nv')
    const stored = sessionStorage.getItem(STORAGE_KEY)
    const initial = isVariant(fromUrl) ? fromUrl : isVariant(stored) ? stored : 'A'
    setVariant(initial)
    const storedDim = Number(sessionStorage.getItem(DIM_KEY))
    if (storedDim >= 20 && storedDim <= 100) setDim(storedDim)
    const sigUrl = new URLSearchParams(window.location.search).get('sig')
    setSignal(sigUrl !== null ? sigUrl === '1' : sessionStorage.getItem(SIGNAL_KEY) === '1')
    const blueUrl = new URLSearchParams(window.location.search).get('blue')
    setBlue(blueUrl !== null ? blueUrl === '1' : sessionStorage.getItem(BLUE_KEY) === '1')
    const speedUrl = new URLSearchParams(window.location.search).get('speed')
    const storedSpeed = sessionStorage.getItem(SPEED_KEY)
    setSpeed(isSpeedRamp(speedUrl) ? speedUrl : isSpeedRamp(storedSpeed) ? storedSpeed : 'current')
  }, [])

  useEffect(() => {
    document.documentElement.dataset.nv = variant
    document.documentElement.dataset.nvSignal = signal ? 'on' : 'off'
    document.documentElement.dataset.nvBlue = blue ? 'on' : 'off'
    document.documentElement.dataset.speed = speed
    sessionStorage.setItem(SPEED_KEY, speed)
    sessionStorage.setItem(BLUE_KEY, blue ? '1' : '0')
    sessionStorage.setItem(STORAGE_KEY, variant)
    sessionStorage.setItem(SIGNAL_KEY, signal ? '1' : '0')
    const url = new URL(window.location.href)
    url.searchParams.set('nv', variant)
    url.searchParams.set('sig', signal ? '1' : '0')
    url.searchParams.set('blue', blue ? '1' : '0')
    url.searchParams.set('speed', speed)
    window.history.replaceState(window.history.state, '', url)

    // Re-read after the cascade settles.
    const id = requestAnimationFrame(() => {
      const style = getComputedStyle(document.documentElement)
      const read = (token: string): string => style.getPropertyValue(token).trim()
      const surface = read('--surface-raised')
      setReadings(TOKENS.map((token) => ({ token, value: read(token), ratio: contrast(read(token), surface) })))
      const wind = ['--wind-light', '--wind-medium', '--wind-heavy', '--wind-storm'].map(read)
      setWindSteps([0, 1, 2].map((i) => contrast(wind[i], wind[i + 1])))
    })
    return () => cancelAnimationFrame(id)
  }, [variant, signal, blue, speed, theme])

  useEffect(() => {
    sessionStorage.setItem(DIM_KEY, String(dim))
  }, [dim])

  const cycle = useCallback((step: number) => {
    setVariant((current) => {
      const index = VARIANTS.findIndex((v) => v.key === current)
      return VARIANTS[(index + step + VARIANTS.length) % VARIANTS.length].key
    })
  }, [])

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, [contenteditable="true"]')) return
      if (event.key === 'ArrowLeft') cycle(-1)
      if (event.key === 'ArrowRight') cycle(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cycle])

  const current = VARIANTS.find((v) => v.key === variant)!
  const night = theme === 'nightvision'

  // Deliberately styled outside the design system (neutral gray) so it never reads as a palette.
  const bar: React.CSSProperties = {
    position: 'fixed',
    left: '50%',
    bottom: 'calc(140px + env(safe-area-inset-bottom, 0px))',
    transform: 'translateX(-50%)',
    zIndex: 10001,
    background: '#2a2a2a',
    color: '#bdbdbd',
    border: '1px solid #444',
    borderRadius: 12,
    padding: '6px 8px',
    font: '12px/1.3 system-ui, sans-serif',
    boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
    width: 'min(372px, calc(100vw - 16px))',
  }
  const button: React.CSSProperties = {
    background: '#3a3a3a',
    color: '#ddd',
    border: '1px solid #555',
    borderRadius: 8,
    padding: '4px 10px',
    font: 'inherit',
    cursor: 'pointer',
  }

  return (
    <>
      {dim < 100 && (
        <div
          aria-hidden
          style={{
            position: 'fixed',
            inset: 0,
            background: '#000',
            opacity: 1 - dim / 100,
            pointerEvents: 'none',
            zIndex: 10000,
          }}
        />
      )}
      {mini ? (
        <button
          data-prototype="nightvision-switcher"
          style={{ ...button, position: 'fixed', right: 8, bottom: 'calc(140px + env(safe-area-inset-bottom, 0px))', zIndex: 10001, background: '#2a2a2a' }}
          onClick={() => setMini(false)}
        >
          NV {current.key} ▴
        </button>
      ) : (
      <div style={bar} data-prototype="nightvision-switcher">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button style={{ ...button, padding: '4px 6px' }} onClick={() => setMini(true)} aria-label="Collapse">
            ▾
          </button>
          <button style={button} onClick={() => cycle(-1)} aria-label="Previous palette">
            ←
          </button>
          <div style={{ flex: 1, textAlign: 'center', fontWeight: 600 }}>
            {current.key} · {current.name}
          </div>
          <button style={button} onClick={() => cycle(1)} aria-label="Next palette">
            →
          </button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 6 }}>
          <button
            style={{ ...button, padding: '4px 8px' }}
            onClick={() => setThemePreference(night ? 'solar' : 'nightvision')}
          >
            {night ? 'Night on' : 'Night OFF — tap'}
          </button>
          <button
            style={{ ...button, padding: '4px 8px', color: signal ? '#7fd6a4' : '#ddd' }}
            onClick={() => setSignal((s) => !s)}
          >
            {signal ? 'Green on' : 'Green off'}
          </button>
          <button
            style={{ ...button, padding: '4px 8px', color: blue ? '#9db8ff' : '#ddd' }}
            onClick={() => setBlue((b) => !b)}
          >
            {blue ? 'Blue on' : 'Blue off'}
          </button>
          <button
            style={{ ...button, padding: '4px 8px' }}
            onClick={() =>
              setSpeed((s) => SPEED_RAMPS[(SPEED_RAMPS.indexOf(s) + 1) % SPEED_RAMPS.length])
            }
          >
            Speed: {speed}
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
            Dim
            <input
              type="range"
              min={20}
              max={100}
              value={dim}
              onChange={(e) => setDim(Number(e.target.value))}
              style={{ flex: 1 }}
            />
            {dim}%
          </label>
          <button style={{ ...button, padding: '4px 8px' }} onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide' : 'Contrast'}
          </button>
        </div>
        {open && (
          <div style={{ marginTop: 6, maxHeight: 220, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {readings.map((r) => (
                  <tr key={r.token}>
                    <td style={{ padding: '1px 4px' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          width: 10,
                          height: 10,
                          background: r.value,
                          marginRight: 6,
                          verticalAlign: 'middle',
                        }}
                      />
                      {r.token.replace('--', '')}
                    </td>
                    <td style={{ padding: '1px 4px', fontFamily: 'monospace' }}>{r.value}</td>
                    <td style={{ padding: '1px 4px', textAlign: 'right' }}>{r.ratio?.toFixed(1) ?? '—'}</td>
                    <td
                      style={{
                        padding: '1px 4px',
                        color: grade(r.ratio) === 'FAIL' ? '#ff6b6b' : '#9ad09a',
                      }}
                    >
                      {grade(r.ratio)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 4 }}>
              Wind band steps (light→med→heavy→storm):{' '}
              {windSteps.map((s) => s?.toFixed(2) ?? '—').join(' · ')}
              <br />
              <span style={{ color: '#888' }}>
                Ratios vs --surface-raised. Steps near 1.0 are only told apart by hue, if at all.
                {variant !== 'A' && variant !== 'B' && (
                  <> Track legends still use the collapsed after-dark wording — that copy would change.</>
                )}
              </span>
            </div>
          </div>
        )}
      </div>
      )}
    </>
  )
}
