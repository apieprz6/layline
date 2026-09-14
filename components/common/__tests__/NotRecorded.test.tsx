import { render, screen } from '@testing-library/react'
import NotRecorded from '../NotRecorded'

/**
 * The rendering of a missing value. Its whole job is to be unmistakable for one:
 * ADR 0012 requires "not recorded" to read as a legitimate answer that is visibly
 * distinct from any recorded value, and the core belief it comes from is that a
 * plausible number never stands in for an absent one.
 */
describe('NotRecorded', () => {
  it('says, in words, that nothing is recorded', () => {
    render(<NotRecorded />)
    expect(screen.getByText('Not recorded')).toBeInTheDocument()
  })

  it('is never a zero and never a dash', () => {
    render(<NotRecorded />)
    // The two failures this component exists to prevent. A dash reads as a value
    // withheld and a zero reads as a measurement, and `wind_direction ?? 0` in
    // services/buoys/ndbc.ts is the mistake in the codebase already.
    expect(screen.getByTestId('not-recorded').textContent).not.toMatch(/[\d–—-]/)
  })

  it('carries the hatched, dashed geometry that no recorded value has', () => {
    render(<NotRecorded />)

    const marker = screen.getByTestId('not-recorded')
    expect(marker).toHaveStyle({ fontStyle: 'italic' })
    expect(marker.getAttribute('style')).toContain('repeating-linear-gradient')
    expect(marker.getAttribute('style')).toContain('dashed')
  })

  it('draws that geometry in tokens, so it survives the night-vision theme', () => {
    render(<NotRecorded />)

    // A literal `rgba(0,0,0,...)` hatch is black on `.theme-nightvision`'s near-black
    // surface, which would erase the marker exactly where it matters most. Every
    // colour here has to come from a variable that the theme reassigns.
    const style = screen.getByTestId('not-recorded').getAttribute('style') ?? ''
    expect(style).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(/i)
  })
})
