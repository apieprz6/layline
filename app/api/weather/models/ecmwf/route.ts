/**
 * ECMWF weather model API route
 * Thin handler that delegates to service layer
 */

import { NextResponse } from 'next/server'
import { fetchECMWF } from '@/services/weather/open-meteo'
import { DEFAULT_FORECAST_LOCATION } from '@/lib/config/locations'

export async function GET() {
  const result = await fetchECMWF(DEFAULT_FORECAST_LOCATION)
  return NextResponse.json(result)
}
