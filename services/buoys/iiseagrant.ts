import type { PurdueBuoyReading } from '@/types'

export type { PurdueBuoyReading }

const IISEAGRANT_URL = 'https://iiseagrant.org/45198/data/45198.xml'

function extractTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))
  return match ? match[1].trim() : null
}

function parseNumeric(
  value: string | null,
  round: boolean
): number | null {
  if (value === null || value === '' || value === 'MM' || value === '999') {
    return null
  }
  const num = parseFloat(value)
  if (isNaN(num)) return null
  return round ? Math.round(num) : num
}

function parseIISEAGrantDate(dateStr: string): Date {
  // Format: "MM/DD/YYYY HH:MM:SS" in UTC
  const match = dateStr.match(
    /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/
  )
  if (!match) {
    throw new Error(`Invalid date format: "${dateStr}"`)
  }
  const [, month, day, year, hour, minute, second] = match
  return new Date(
    `${year}-${month}-${day}T${hour}:${minute}:${second}Z`
  )
}

export function parseIISEAGrantXML(xml: string): PurdueBuoyReading {
  const station = extractTag(xml, 'station')
  if (station !== '45198') {
    throw new Error(`Unexpected station: "${station}"`)
  }

  const dateStr = extractTag(xml, 'date')
  if (!dateStr) {
    throw new Error('Missing <date> element')
  }

  const timestamp = parseIISEAGrantDate(dateStr)
  if (isNaN(timestamp.getTime())) {
    throw new Error(`Invalid date value: "${dateStr}"`)
  }

  return {
    timestamp,
    wind_speed: parseNumeric(extractTag(xml, 'wspd1'), false),
    wind_direction: parseNumeric(extractTag(xml, 'wdir1'), true),
    wind_gust: parseNumeric(extractTag(xml, 'gust1'), false),
    air_temp: parseNumeric(extractTag(xml, 'atmp1'), false),
    water_temp: parseNumeric(extractTag(xml, 'wtmp1'), false),
    pressure: parseNumeric(extractTag(xml, 'baro1'), false),
    humidity: parseNumeric(extractTag(xml, 'rrh'), false),
    wave_height: parseNumeric(extractTag(xml, 'wvhgt'), false),
    wave_period: parseNumeric(extractTag(xml, 'dompd'), false),
    wave_direction: parseNumeric(extractTag(xml, 'mwdir'), true),
  }
}

export async function fetchIISEAGrantXML(): Promise<string> {
  const response = await fetch(IISEAGRANT_URL, {
    cache: 'no-store',
    headers: {
      'User-Agent': 'Layline Sailing Dashboard (contact: layline@sailing.app)',
    },
  })

  if (!response.ok) {
    throw new Error(
      `IISEAGrant fetch failed: ${response.status} ${response.statusText}`
    )
  }

  const text = await response.text()

  if (!text.trim()) {
    throw new Error('IISEAGrant returned empty response')
  }

  return text
}
