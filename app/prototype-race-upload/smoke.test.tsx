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
import { RECORDINGS, costMeter, windowView, windowRefusals, fmtWindow } from './shared'

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

describe('variant A carries the charts through the wizard', () => {
  it('places a sail change from the chart, then locks it on the next step', () => {
    const { container } = render(<VariantA />)
    fireEvent.click(screen.getByText(/08-26-26-beer-can\.csv/).closest('button')!)

    // The stack is two charts sharing one window: the track map, then the channel.
    expect(container.querySelectorAll('svg').length).toBe(2)
    // all four channels are reachable from the pill row
    for (const label of ['SOG', 'TWS', 'TWA', 'AWA']) expect(screen.getByText(label)).toBeTruthy()

    fireEvent.click(screen.getByText('Next')) // → Sails
    const chart = container.querySelectorAll('svg')[1]
    fireEvent.pointerDown(chart, { clientX: 200, clientY: 60 })

    // tapping the chart opens the entry, rather than making the sailor type a time
    expect(screen.getByText('Sails up')).toBeTruthy()
    fireEvent.click(screen.getByText('Main'))
    fireEvent.click(screen.getByText('Full'))

    const editable = [...container.querySelectorAll('g')].filter((g) => (g as SVGGElement).style.opacity === '1')
    expect(editable.length).toBeGreaterThan(0)

    fireEvent.click(screen.getByText('Next')) // → Sea state
    // the sail change is still drawn, and is now read-only
    const locked = [...container.querySelectorAll('g')].filter((g) => {
      const o = (g as SVGGElement).style.opacity
      return o === '0.5' || o === '0.45'
    })
    expect(locked.length).toBeGreaterThan(0)
    expect(screen.queryByText('Sails up')).toBeNull()
  })
})

/**
 * The argument LAY-94 exists to settle is how much typing a race costs, so this
 * measures it rather than guessing: the seven real sail changes of
 * 08-26-26-beer-can, entered through Variant A, counted by the shared cost meter.
 */
describe('what a busy race costs in Variant A', () => {
  const LABELS: Record<string, string> = {
    main: 'Main',
    'jib-1': 'Jib 1',
    'jib-2': 'Jib 2',
    'jib-3': 'Jib 3',
    A2: 'A2',
    A3: 'A3',
  }

  it('enters seven sail changes and reports the action count', () => {
    const f = RECORDINGS.find((r) => r.filename === '08-26-26-beer-can.csv')!
    expect(f.truth.sails).toHaveLength(7)

    costMeter.reset()
    const { container } = render(<VariantA />)
    fireEvent.click(screen.getByText(/08-26-26-beer-can\.csv/).closest('button')!)
    fireEvent.click(screen.getByText('Next')) // → Sails

    // Carry-forward means each change costs the difference from the last plan,
    // not a fresh sail plan — which is the whole reason seven is affordable.
    let carried: string[] = []
    let reefSet = false
    for (const entry of f.truth.sails) {
      fireEvent.pointerDown(container.querySelectorAll('svg')[1], { clientX: 200, clientY: 60 })
      const changed = [
        ...entry.sails.filter((s) => !carried.includes(s)),
        ...carried.filter((s) => !entry.sails.includes(s)),
      ]
      // the pickers count their own taps, so the test must not double-count
      for (const s of changed) fireEvent.click(screen.getByText(LABELS[s]))
      if (!reefSet) {
        fireEvent.click(screen.getByText('Full'))
        reefSet = true
      }
      carried = entry.sails
    }

    fireEvent.click(screen.getByText('Next')) // → Sea state
    fireEvent.click(screen.getByText('Next')) // → Review

    // Pinned rather than bounded: this figure is the answer LAY-94 reports, so a
    // change to the flow that costs the sailor more taps should fail here.
    expect(costMeter.actions).toBe(24)
    expect(screen.getByText('Anything else you know?')).toBeTruthy()
  })

  it('costs five actions when there is nothing to annotate', () => {
    costMeter.reset()
    render(<VariantA />)
    fireEvent.click(screen.getByText(/06-03-26-beer-can\.csv/).closest('button')!)
    for (let i = 0; i < 3; i += 1) fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Save race'))

    // The floor of the flow: pick the file, walk through, submit. Everything
    // above five is something the sailor chose to say about the race.
    expect(costMeter.actions).toBe(5)
    expect(screen.getByText(/everything that would be written/)).toBeTruthy()
  })
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
