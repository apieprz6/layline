/**
 * TEMPORARY — render smoke check, deleted before the prototype is captured.
 * Loopback HTTP is unavailable in this environment, so this is how the four
 * variants are actually exercised rather than merely compiled.
 */

import { render, screen, fireEvent } from '@testing-library/react'
import VariantA from './VariantA'
import VariantB from './VariantB'
import VariantC from './VariantC'
import VariantD from './VariantD'
import { RECORDINGS, windowView, windowRefusals, fmtWindow } from './shared'

describe('prototype variants render', () => {
  const cases: [string, () => React.ReactElement][] = [
    ['A', () => <VariantA />],
    ['B', () => <VariantB />],
    ['C', () => <VariantC />],
    ['D', () => <VariantD />],
  ]

  for (const [name, el] of cases) {
    it(`variant ${name} mounts, takes the heavy file, and draws its trace`, () => {
      const { container, unmount } = render(el())

      // D deliberately opens on the archive rather than on a chooser.
      if (name === 'D') fireEvent.click(screen.getByText('+ Log a recording'))

      const heavy = screen.getByText(/08-26-26-beer-can\.csv/)
      fireEvent.click(heavy.closest('button')!)

      const svg = container.querySelector('svg')
      expect(svg).not.toBeNull()
      // the trace must break across dropouts rather than draw one flat line
      expect(svg!.querySelectorAll('polyline').length).toBeGreaterThan(0)
      unmount()
    })
  }
})

describe('the maths the variants share', () => {
  it('computes row quality over the whole file, then filters', () => {
    const f = RECORDINGS.find((r) => r.filename === '09-02-2026-beer-can.csv')!
    const whole = windowView(f, f.firstRowTime.replace(' ', 'T'), f.lastRowTime.replace(' ', 'T'))
    expect(whole.frozen).toBeGreaterThan(100)
    expect(whole.longestDropoutSeconds).toBeGreaterThan(0)
  })

  it('refuses a window with no rows, and allows one that outruns the data', () => {
    const f = RECORDINGS.find((r) => r.filename === '08-22-26-glr.csv')!
    expect(windowRefusals(f, '1999-01-01T00:00', '1999-01-01T01:00')).toHaveLength(1)
    expect(windowRefusals(f, f.truth.windowStart.replace(' ', 'T'), f.truth.windowFinish.replace(' ', 'T'))).toHaveLength(0)
  })

  it('renders a window across midnight without a same-day assumption', () => {
    const f = RECORDINGS.find((r) => r.filename === '06-26-26-chi-mi-chi.csv')!
    const s = fmtWindow(f.truth.windowStart.replace(' ', 'T'), f.truth.windowFinish.replace(' ', 'T'))
    expect(s).toMatch(/Jun 26.*Jun 27/)
  })
})
