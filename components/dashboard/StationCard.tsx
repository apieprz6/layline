import type { BuoyDataResult } from '@/types'
import StationRow from './StationRow'
import { radius } from '@/lib/utils/design'

interface StationCardProps {
  buoyResult: BuoyDataResult
}

export default function StationCard({ buoyResult }: StationCardProps) {
  const { data, status } = buoyResult

  // Handle missing data
  if (!data) {
    return null
  }

  return (
    <div
      style={{
        borderRadius: radius('md'),
        border: '1px solid var(--card-border)',
        background: 'var(--card-bg)',
        overflow: 'hidden',
        transition: 'border-color 200ms',
      }}
    >
      <StationRow
        buoyId={data.buoyId}
        windSpeed={data.windSpeed}
        windDirection={data.windDirection}
        windGust={data.windGust}
        status={status}
      />
    </div>
  )
}
