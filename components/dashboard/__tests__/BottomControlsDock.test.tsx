import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BottomControlsDock from '../BottomControlsDock'
import { formatDateTimeRange } from '@/lib/utils/time'

const referenceTime = new Date(2026, 9, 13, 18, 0)
const windowStart = new Date(2026, 9, 13, 17, 0)

function renderDock(isLive: boolean, onReturnToLive = jest.fn()) {
  render(
    <BottomControlsDock
      scaleId="1h"
      nowOffset={isLive ? 0 : 30}
      maxOffset={4260}
      timeWindowMinutes={60}
      isLive={isLive}
      referenceTime={referenceTime}
      windowStart={windowStart}
      onScaleChange={jest.fn()}
      onOffsetChange={jest.fn()}
      onReturnToLive={onReturnToLive}
    />
  )
  return onReturnToLive
}

describe('BottomControlsDock', () => {
  it('labels neither the scale control nor the scrubber', () => {
    renderDock(true)

    expect(screen.queryByText('Scale')).not.toBeInTheDocument()
    expect(screen.queryByText('Time scrubber')).not.toBeInTheDocument()
    // The controls themselves are still there.
    expect(screen.getByRole('button', { name: '1h' })).toBeInTheDocument()
  })

  it('keeps the Live button beside the scale control, in the same row', () => {
    renderDock(true)

    const live = screen.getByRole('button', { name: 'Live →' })
    const scale = screen.getByRole('button', { name: '1h' })
    const row = live.parentElement
    expect(row).toContainElement(scale)
  })

  it('disables Live while already at live', () => {
    renderDock(true)
    expect(screen.getByRole('button', { name: 'Live →' })).toBeDisabled()
  })

  it('returns to live when Live is tapped while scrubbed back', async () => {
    const onReturnToLive = renderDock(false)

    await userEvent.setup().click(screen.getByRole('button', { name: 'Live →' }))
    expect(onReturnToLive).toHaveBeenCalledTimes(1)
  })

  it('captions the window it is showing', () => {
    renderDock(true)

    expect(
      screen.getByText(
        `${formatDateTimeRange(windowStart)} → ${formatDateTimeRange(referenceTime)}`
      )
    ).toBeInTheDocument()
  })
})
