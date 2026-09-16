import { render, screen } from '@testing-library/react'
import Skeleton, { SkeletonScreen, SkeletonText } from '@/components/common/Skeleton'

describe('Skeleton', () => {
  it('is a bar of the asked-for box, carrying the pulse class', () => {
    render(<Skeleton width="7px" height="7px" radius="var(--radius-full)" />)

    const bar = screen.getByTestId('skeleton')
    expect(bar).toHaveClass('skeleton')
    expect(bar).toHaveStyle({ width: '7px', height: '7px', borderRadius: 'var(--radius-full)' })
  })

  it('takes extra layout from a style prop without losing the class', () => {
    render(<Skeleton style={{ aspectRatio: '1', marginTop: '4px' }} />)

    const bar = screen.getByTestId('skeleton')
    expect(bar).toHaveClass('skeleton')
    expect(bar).toHaveStyle({ aspectRatio: '1', marginTop: '4px' })
  })
})

describe('SkeletonText', () => {
  // The height of a text placeholder is not passed in — it is the line box of the
  // font-size it was given, which is what makes it exactly as tall as the string it
  // stands in for. jsdom cannot measure that, so what is asserted here is the two
  // things the measurement depends on: the font-size, and a character to lay out.
  it('sizes itself from a font-size and one non-breaking space', () => {
    render(<SkeletonText fontSize="var(--text-base)" width="60%" />)

    const bar = screen.getByTestId('skeleton')
    expect(bar).toHaveStyle({ fontSize: 'var(--text-base)', width: '60%' })
    expect(bar.textContent).toBe('\u00A0')
  })

  it('accepts a line-height for text that does not inherit the body’s', () => {
    render(<SkeletonText fontSize="var(--text-2xl)" lineHeight="var(--leading-tight)" />)

    expect(screen.getByTestId('skeleton')).toHaveStyle({ lineHeight: 'var(--leading-tight)' })
  })
})

describe('SkeletonScreen', () => {
  it('says what is being waited for, and only that', () => {
    render(
      <SkeletonScreen label="Loading wind data">
        <h1>Wind Data</h1>
        <SkeletonText fontSize="12px" />
      </SkeletonScreen>
    )

    // The live region is the label alone. Wrapping the whole screen in `role=status`
    // would announce every piece of real chrome inside it as if it had just changed.
    // The label is the region's *content*, which is what a live region announces —
    // `status` is not a name-from-content role, so an `aria-label` here would be read
    // by nothing.
    expect(screen.getByRole('status').textContent).toBe('Loading wind data')

    const box = screen.getByTestId('skeleton-screen')
    expect(box).toHaveAttribute('aria-busy', 'true')
    // Outside the busy box on purpose: `aria-busy` asks for updates from its subtree to
    // be held back, and this one is replaced rather than cleared.
    expect(box).not.toContainElement(screen.getByRole('status'))
    expect(screen.getByRole('heading', { name: 'Wind Data' })).toBeInTheDocument()
  })

  it('is the page’s own root box, so the class and style reach it', () => {
    render(
      <SkeletonScreen label="Loading the dashboard" className="p-4 grid gap-4" style={{ background: 'var(--page-bg)' }}>
        <div />
      </SkeletonScreen>
    )

    const root = screen.getByTestId('skeleton-screen')
    expect(root).toHaveClass('p-4', 'grid', 'gap-4')
    expect(root).toHaveStyle({ background: 'var(--page-bg)' })
  })
})
