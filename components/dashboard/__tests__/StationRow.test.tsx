import { render, screen, fireEvent } from '@testing-library/react'
import StationRow from '../StationRow'

// Mock Next.js navigation
const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}))

// Mock station config
jest.mock('@/lib/config/stations', () => ({
  getStationInfo: (buoyId: string) => ({
    name: buoyId === 'CHII2' ? 'Harrison Dever Crib' : 'Purdue Buoy',
    location: 'Lake Michigan',
  }),
  getStatusColor: () => '#00FF00',
}))

// Mock wind utilities
jest.mock('@/lib/utils/wind', () => ({
  getWindCondition: () => ({ color: '#0055BB' }),
  getWindColorHex: () => '#0055BB',
}))

// Mock design utilities
jest.mock('@/lib/utils/design', () => ({
  radius: () => '8px',
  spacing: () => '8px',
}))

describe('StationRow - Navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('navigates to station detail page when clicked', () => {
    render(
      <StationRow
        buoyId="CHII2"
        windSpeed={12}
        windDirection={180}
        status="online"
      />
    )

    const row = screen.getByText('Harrison Dever Crib').closest('div')
    fireEvent.click(row!)

    expect(mockPush).toHaveBeenCalledWith('/station/CHII2')
  })

  it('navigates to correct buoyId for Purdue Buoy', () => {
    render(
      <StationRow
        buoyId="45198"
        windSpeed={10}
        windDirection={200}
        status="online"
      />
    )

    const row = screen.getByText('Purdue Buoy').closest('div')
    fireEvent.click(row!)

    expect(mockPush).toHaveBeenCalledWith('/station/45198')
  })
})
