import { render, screen } from '@testing-library/react'
import StationLayout from '../StationLayout'

describe('StationLayout', () => {
  const defaultProps = {
    header: <div data-testid="header">Header</div>,
    polarChart: <div data-testid="polar-chart">Polar Chart</div>,
    speedChart: <div data-testid="speed-chart">Speed Chart</div>,
    tabbedPanel: <div data-testid="tabbed-panel">Tabbed Panel</div>,
    dock: <div data-testid="dock">Dock</div>,
  }

  it('renders all slots', () => {
    render(<StationLayout {...defaultProps} />)

    expect(screen.getByTestId('header')).toBeInTheDocument()
    expect(screen.getByTestId('polar-chart')).toBeInTheDocument()
    expect(screen.getByTestId('speed-chart')).toBeInTheDocument()
    expect(screen.getByTestId('tabbed-panel')).toBeInTheDocument()
    expect(screen.getByTestId('dock')).toBeInTheDocument()
  })

  it('applies station-layout class to root element', () => {
    const { container } = render(<StationLayout {...defaultProps} />)

    expect(container.firstChild).toHaveClass('station-layout')
  })

  it('places polar chart in the correct grid area', () => {
    render(<StationLayout {...defaultProps} />)

    const polarChart = screen.getByTestId('polar-chart')
    expect(polarChart.parentElement).toHaveClass('station-layout__polar')
  })

  it('places speed chart in the correct grid area', () => {
    render(<StationLayout {...defaultProps} />)

    const speedChart = screen.getByTestId('speed-chart')
    expect(speedChart.parentElement).toHaveClass('station-layout__speed')
  })

  it('places tabbed panel in the correct grid area', () => {
    render(<StationLayout {...defaultProps} />)

    const tabbedPanel = screen.getByTestId('tabbed-panel')
    expect(tabbedPanel.parentElement).toHaveClass('station-layout__tabbed')
  })

  it('renders null slots without crashing', () => {
    render(
      <StationLayout
        header={<div data-testid="header">Header</div>}
        polarChart={null}
        speedChart={null}
        tabbedPanel={null}
        dock={<div data-testid="dock">Dock</div>}
      />
    )

    expect(screen.getByTestId('header')).toBeInTheDocument()
    expect(screen.getByTestId('dock')).toBeInTheDocument()
  })
})
