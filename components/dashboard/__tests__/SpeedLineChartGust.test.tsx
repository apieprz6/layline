import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import SpeedLineChart from '../SpeedLineChart'
import type { StationCapability, WindDataPoint, WindDataPointWithOffset } from '@/types'

const referenceTime = new Date('2026-10-13T18:00:00Z')

const GUST: StationCapability = { gust: true, waves: false }

// 10-minute cadence, oldest last.
const data: WindDataPoint[] = [
  { timestamp: '2026-10-13T18:00:00Z', spd: 12.4, dir: 220, gust: 18.2 },
  { timestamp: '2026-10-13T17:50:00Z', spd: 11, dir: 215, gust: 16 },
  { timestamp: '2026-10-13T17:40:00Z', spd: 10, dir: 210, gust: null },
  { timestamp: '2026-10-13T17:30:00Z', spd: 9, dir: 210, gust: 13 },
  { timestamp: '2026-10-13T17:20:00Z', spd: 9, dir: 205, gust: 26 },
  { timestamp: '2026-10-13T17:10:00Z', spd: 8, dir: 200, gust: 12 },
]

function renderChart(props: {
  data?: WindDataPoint[]
  capability?: StationCapability
  hoverPoint?: WindDataPointWithOffset | null
  timeWindowMinutes?: number
}) {
  return render(
    <SpeedLineChart
      data={props.data ?? data}
      timeWindowMinutes={props.timeWindowMinutes ?? 60}
      nowOffsetMinutes={0}
      referenceTime={referenceTime}
      hoverPoint={props.hoverPoint ?? null}
      onHoverChange={() => {}}
      capability={props.capability}
    />
  )
}

const bands = (container: HTMLElement) => container.querySelectorAll('[data-testid="gust-band"]')
const yTickLabels = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('text'))
    .map((t) => t.textContent ?? '')
    .filter((t) => /^\d+$/.test(t))
    .map(Number)

describe('SpeedLineChart gust band', () => {
  it('shades from the speed trace up to gust, broken where a gust reading is null', () => {
    const { container } = renderChart({ capability: GUST })
    // 18:00–17:50 is one run; 17:40 has no gust; 17:30–17:10 is another.
    expect(bands(container)).toHaveLength(2)
  })

  it('breaks the band across an outage, the way the trace breaks', () => {
    const gapped: WindDataPoint[] = [
      { timestamp: '2026-10-13T18:00:00Z', spd: 12, dir: 220, gust: 18 },
      { timestamp: '2026-10-13T17:50:00Z', spd: 11, dir: 215, gust: 16 },
      { timestamp: '2026-10-13T15:30:00Z', spd: 10, dir: 210, gust: 15 },
      { timestamp: '2026-10-13T15:20:00Z', spd: 9, dir: 210, gust: 13 },
    ]
    const { container } = renderChart({ data: gapped, capability: GUST, timeWindowMinutes: 180 })
    expect(bands(container)).toHaveLength(2)
  })

  it('scales the y-axis to include the highest gust, not just the highest speed', () => {
    const withGust = yTickLabels(renderChart({ capability: GUST }).container)
    expect(Math.max(...withGust)).toBeGreaterThanOrEqual(26)
  })

  it('draws no band, and scales to speed alone, for a station without gust capability', () => {
    const { container } = renderChart({ capability: { gust: false, waves: true } })
    expect(bands(container)).toHaveLength(0)
    expect(Math.max(...yTickLabels(container))).toBeLessThan(26)
  })

  it('draws no band with no capability given', () => {
    expect(bands(renderChart({}).container)).toHaveLength(0)
  })
})

describe('SpeedLineChart hover label', () => {
  const hovered = (i: number): WindDataPointWithOffset => ({ ...data[i], minsAgo: i * 10 })

  it('reads "12.4 G18" when the hovered reading has a gust', () => {
    renderChart({ capability: GUST, hoverPoint: hovered(0) })
    expect(screen.getByText('12.4 G18')).toBeInTheDocument()
  })

  it('reads speed alone when that reading has no gust', () => {
    renderChart({ capability: GUST, hoverPoint: hovered(2) })
    expect(screen.getByText('10.0 kt')).toBeInTheDocument()
  })

  it('reads speed alone for a station without gust capability', () => {
    renderChart({ capability: { gust: false, waves: false }, hoverPoint: hovered(0) })
    expect(screen.getByText('12.4 kt')).toBeInTheDocument()
  })
})
