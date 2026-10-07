'use client'

import { useState, type ReactElement } from 'react'
import { spacing } from '@/lib/utils/design'
import { ScreenHeader } from '../prototype-lay147/Chrome'
import { CHANNEL_TITLES, CHARTS, RACES, raceName, shortDate, signed, AUTOCOMP, type Channel, type Race, type VariantKey } from './data'
import { Sheet } from './Sheet'
import * as A from './VariantA'
import * as B from './VariantB'
import * as C from './VariantC'
import * as D from './VariantD'

/**
 * PROTOTYPE — LAY-149's host. LAY-147's winning card stack, cut down to what the drawer needs and
 * re-pointed at the real archive, so each variant's sheet opens from the screen it will live on.
 * The card's verdict line is the variant's — that is LAY-149 Q4 showing up on the card.
 */
const VARIANTS = { A, B, C, D } as const

const FIGURES: Record<Channel, { value: string; basis: string }> = {
  hdg: {
    value: signed(CHARTS.hdgEras[1].raceMean, '°'),
    basis: `since ${shortDate(AUTOCOMP)} · ${CHARTS.hdgEras[1].races} races · row-weighted per Race`,
  },
  awa: {
    value: `${signed(CHARTS.awaEra.up, '°')} up · ${signed(CHARTS.awaEra.down, '°')} down`,
    basis: `${CHARTS.awaEra.upPairs} + ${CHARTS.awaEra.downPairs} tack pairs · ${CHARTS.awaEra.races} races`,
  },
  stw: {
    value: signed(CHARTS.stwEra.fit.bias, ' kt', 2),
    basis: `R² ${CHARTS.stwEra.fit.r2.toFixed(2)} · ${CHARTS.stwEra.points} rows · ${CHARTS.stwEra.races} races`,
  },
}

export function Host({
  variant,
  view,
  open,
  raceId,
}: {
  variant: VariantKey
  view: 'screen' | 'tile'
  open: Channel | null
  raceId: string
}): ReactElement {
  const v = VARIANTS[variant]
  const [opened, setOpened] = useState<Channel | null>(open)

  if (view === 'tile') {
    const race: Race = RACES.find((r) => r.id === raceId) ?? RACES[9]
    return <TileView race={race} tile={<v.RaceTile race={race} />} />
  }

  return (
    <div style={{ background: 'var(--page-bg)', minHeight: '100vh', paddingBottom: 72 }}>
      <ScreenHeader subtitle="Real archive · 13 races · figures computed by compute-charts.py. Tap a card for the chart behind it." />
      <div style={{ padding: spacing(4), display: 'flex', flexDirection: 'column', gap: spacing(3) }}>
        {(['hdg', 'awa', 'stw'] as Channel[]).map((channel) => {
          const verdict = v.TRUST.verdict(channel)
          return (
            <section
              key={channel}
              role="button"
              tabIndex={0}
              aria-haspopup="dialog"
              onClick={() => setOpened(channel)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setOpened(channel)
                }
              }}
              style={{
                background: 'var(--surface-raised)',
                border: '1px solid var(--surface-border)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-md)',
                padding: spacing(3),
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 13.5, fontWeight: 700 }}>{CHANNEL_TITLES[channel].label}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: channel === 'awa' ? 'var(--state-warning)' : 'var(--text-muted)' }}>
                    {CHANNEL_TITLES[channel].term}
                  </div>
                </div>
                <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>›</span>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, marginTop: 8 }}>{FIGURES[channel].value}</div>
              <div style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>{FIGURES[channel].basis}</div>
              <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: 8.5,
                    fontWeight: 700,
                    padding: '2px 7px',
                    borderRadius: 9999,
                    background: 'rgba(196,112,0,0.12)',
                    color: 'var(--state-warning)',
                  }}
                >
                  {verdict.word}
                </span>
                <span style={{ fontSize: 9.5, color: 'var(--text-secondary)' }}>{verdict.why}</span>
              </div>
            </section>
          )
        })}
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>
          Verdict rule in this variant: {v.TRUST.rule}
        </div>
      </div>
      {opened && (
        <Sheet channel={opened} onClose={() => setOpened(null)}>
          <v.Drawer channel={opened} />
        </Sheet>
      )}
    </div>
  )
}

/** Q6: the per-Race "Instrument calibration check" tile, on a stand-in for Race analysis. */
function TileView({ race, tile }: { race: Race; tile: ReactElement }): ReactElement {
  return (
    <div style={{ background: 'var(--page-bg)', minHeight: '100vh', padding: spacing(4), paddingBottom: 72 }}>
      <span style={{ fontSize: 12, color: 'var(--text-accent)' }}>‹ Races</span>
      <h1 style={{ margin: '8px 0 2px', fontFamily: 'var(--font-display)', fontSize: 20 }}>Race analysis</h1>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: spacing(3) }}>
        {raceName(race)} · {race.hours} h · {race.countable} Countable rows
      </div>
      {['Track', 'Performance', 'Manoeuvres', 'Sail vs chart'].map((s) => (
        <div key={s} style={{ border: '1px dashed var(--surface-border)', borderRadius: 8, padding: 10, marginBottom: 8, fontSize: 11, color: 'var(--text-muted)' }}>
          {s} — LAY-148
        </div>
      ))}
      <section style={{ background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderRadius: 'var(--radius-md)', padding: spacing(3) }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 13.5, fontWeight: 700 }}>Instrument calibration check</div>
          <span style={{ fontSize: 11, color: 'var(--text-accent)' }}>Season ›</span>
        </div>
        {tile}
      </section>
      <select
        defaultValue={race.id}
        onChange={(e) => {
          const next = new URLSearchParams(window.location.search)
          next.set('race', e.target.value)
          window.location.search = next.toString()
        }}
        style={{ marginTop: 16, width: '100%', fontSize: 12, padding: 6 }}
      >
        {RACES.map((r) => (
          <option key={r.id} value={r.id}>
            {raceName(r)}
          </option>
        ))}
      </select>
    </div>
  )
}
