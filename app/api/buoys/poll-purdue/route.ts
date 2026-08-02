import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { PurdueBuoyReading } from '@/types'
import {
  fetchIISEAGrantXML,
  parseIISEAGrantXML,
} from '@/services/buoys/iiseagrant'

export async function GET(): Promise<NextResponse> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('poll-purdue: Missing Supabase environment variables')
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 }
    )
  }

  let xml: string
  try {
    xml = await fetchIISEAGrantXML()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('poll-purdue: Fetch failed:', message)
    return NextResponse.json({ error: message }, { status: 502 })
  }

  let reading: PurdueBuoyReading
  try {
    reading = parseIISEAGrantXML(xml)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('poll-purdue: Parse failed:', message)
    return NextResponse.json({ error: message }, { status: 422 })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  const { error: insertError } = await supabase
    .from('purdue_buoy_readings')
    .upsert(
      {
        timestamp: reading.timestamp.toISOString(),
        wind_speed: reading.wind_speed,
        wind_direction: reading.wind_direction,
        wind_gust: reading.wind_gust,
        air_temp: reading.air_temp,
        water_temp: reading.water_temp,
        pressure: reading.pressure,
        humidity: reading.humidity,
        wave_height: reading.wave_height,
        wave_period: reading.wave_period,
        wave_direction: reading.wave_direction,
      },
      { onConflict: 'timestamp', ignoreDuplicates: true }
    )

  if (insertError) {
    console.error('poll-purdue: Insert failed:', insertError.message)
    return NextResponse.json(
      { error: 'Database insert failed' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    ok: true,
    timestamp: reading.timestamp.toISOString(),
  })
}
