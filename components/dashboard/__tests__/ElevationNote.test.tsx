import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ElevationNote from '../ElevationNote'
import type { BuoyMetadata } from '@/types'

const chii2: BuoyMetadata = {
  station: 'CHII2',
  source: 'ndbc',
  location: { latitude: 41.87, longitude: -87.59 },
  windMeasurementHeight: 85,
  adjustmentNote: 'Wind at this height typically reads 20–30% higher than at the surface.',
  capability: { gust: true, waves: false },
}

const purdue: BuoyMetadata = {
  station: '45198',
  source: 'ndbc',
  location: { latitude: 41.89, longitude: -87.6 },
  windMeasurementHeight: 3,
  adjustmentNote: 'Surface-level measurements',
  capability: { gust: true, waves: true },
}

const chip = () => screen.getByRole('button', { name: /Measured at 85 ft/ })

describe('ElevationNote', () => {
  it('is a "85 ft" chip, closed until tapped', () => {
    render(<ElevationNote metadata={chii2} />)

    expect(chip()).toHaveTextContent('85 ft')
    expect(chip()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it("names speed and gust, and says it in the station's own words", async () => {
    render(<ElevationNote metadata={chii2} />)
    await userEvent.click(chip())

    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Speed and gust measured 85 ft above the water. Wind at this height typically reads 20–30% higher than at the surface.'
    )
    expect(chip()).toHaveAttribute('aria-expanded', 'true')
  })

  it('names speed alone for a station without gust', async () => {
    render(<ElevationNote metadata={{ ...chii2, capability: { gust: false, waves: false } }} />)
    await userEvent.click(chip())

    expect(screen.getByRole('tooltip')).toHaveTextContent(/^Speed measured 85 ft above the water\./)
  })

  it('toggles closed on a second tap', async () => {
    render(<ElevationNote metadata={chii2} />)
    await userEvent.click(chip())
    await userEvent.click(chip())

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    render(<ElevationNote metadata={chii2} />)
    await userEvent.click(chip())
    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('closes on a tap outside', async () => {
    render(
      <>
        <ElevationNote metadata={chii2} />
        <p>elsewhere</p>
      </>
    )
    await userEvent.click(chip())
    await userEvent.click(screen.getByText('elsewhere'))

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('renders nothing for a station measured at or below the 10 m standard', () => {
    const { container } = render(<ElevationNote metadata={purdue} />)
    expect(container).toBeEmptyDOMElement()

    const { container: atStandard } = render(
      <ElevationNote metadata={{ ...chii2, windMeasurementHeight: 33 }} />
    )
    expect(atStandard).toBeEmptyDOMElement()
  })
})
