/**
 * GFS weather model API route
 * Thin handler that delegates to service layer
 * Supports query parameters: lat, lon, name for custom locations
 */

import { NextResponse } from 'next/server'
import { fetchGFS } from '@/services/weather/open-meteo'
import { DEFAULT_FORECAST_LOCATION } from '@/lib/config/locations'
import type { ForecastLocation } from '@/types'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const lat = searchParams.get('lat')
  const lon = searchParams.get('lon')
  const name = searchParams.get('name')

  // Use custom location if lat/lon provided, otherwise default
  let location: ForecastLocation = DEFAULT_FORECAST_LOCATION
  if (lat && lon) {
    const latitude = parseFloat(lat)
    const longitude = parseFloat(lon)
    if (!isNaN(latitude) && !isNaN(longitude)) {
      location = {
        latitude,
        longitude,
        name: name || 'Custom Location',
      }
    }
  }

  const result = await fetchGFS(location)
  return NextResponse.json(result)
}
