/**
 * Station configuration module
 * Centralized metadata and status handling for all buoy stations
 */

import type { DataSourceStatus } from '@/types'

export interface StationMetadata {
  name: string
  location: string
}

/**
 * Station metadata for all known buoys
 * Defines display names and location descriptions
 */
export const STATION_METADATA: Record<string, StationMetadata> = {
  CHII2: {
    name: 'Harrison Dever Crib',
    location: '2.2mi offshore · 85ft elevation',
  },
  '45198': {
    name: 'Purdue Buoy',
    location: '2.8mi offshore · surface',
  },
}

/**
 * Get station metadata by buoy ID
 * @param buoyId - Buoy identifier (e.g., 'CHII2', '45198')
 * @returns Station metadata or undefined if unknown buoy
 */
export function getStationInfo(buoyId: string): StationMetadata | undefined {
  return STATION_METADATA[buoyId]
}

/**
 * Get status dot color based on data source status
 * Returns CSS variable references for consistency with design system
 *
 * @param status - Data source status enum
 * @returns CSS variable string for status color
 */
export function getStatusColor(status: DataSourceStatus): string {
  switch (status) {
    case 'online':
      return 'var(--state-success)' // green
    case 'recent':
      return 'var(--state-warning)' // amber
    case 'stale':
    case 'offline':
    case 'error':
    default:
      return 'var(--state-neutral)' // gray
  }
}

/**
 * Get human-readable status label
 * @param status - Data source status enum
 * @returns Capitalized status label
 */
export function getStatusLabel(status: DataSourceStatus): string {
  switch (status) {
    case 'online':
      return 'Online'
    case 'recent':
      return 'Recent'
    case 'stale':
      return 'Stale'
    case 'offline':
      return 'Offline'
    case 'error':
      return 'Error'
    default:
      return 'Unknown'
  }
}
