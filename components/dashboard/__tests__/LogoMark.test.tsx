import { render, screen } from '@testing-library/react'
import LogoMark from '../LogoMark'

describe('LogoMark', () => {
  it('paints every part from the logo tokens, so night vision can recolour it', () => {
    render(<LogoMark />)
    const mark = screen.getByTestId('logo-mark')

    const painted = Array.from(mark.querySelectorAll<SVGElement>('rect, line, circle')).map(
      (el) => el.style.fill || el.style.stroke
    )
    expect(painted).toEqual([
      'var(--logo-ground)',
      'var(--logo-mark)',
      'var(--logo-mark)',
      'var(--logo-mark)',
    ])
  })
})
