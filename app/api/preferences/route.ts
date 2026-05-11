import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { UserPreferences } from '@/types'

/**
 * Default user preferences when no profile exists.
 * All data sources enabled by default per ADR 0001.
 */
const DEFAULT_PREFERENCES: UserPreferences = {
  dataSources: {
    chii2: {
      enabled: true,
      displayName: 'Harrison Dever Crib',
    },
    45198: {
      enabled: true,
      displayName: 'Purdue Buoy',
    },
  },
}

/**
 * Validates user preferences structure.
 * Ensures required fields exist and types are correct.
 */
function validatePreferences(data: unknown): data is UserPreferences {
  if (!data || typeof data !== 'object') return false

  const prefs = data as Partial<UserPreferences>

  // Check dataSources exists and is an object
  if (!prefs.dataSources || typeof prefs.dataSources !== 'object') return false

  // Validate each data source
  const sources = prefs.dataSources as Record<string, unknown>
  for (const key of ['chii2', '45198']) {
    const source = sources[key]
    if (!source || typeof source !== 'object') return false

    const s = source as Record<string, unknown>
    if (typeof s.enabled !== 'boolean' || typeof s.displayName !== 'string') {
      return false
    }
  }

  return true
}

/**
 * GET /api/preferences
 *
 * Fetches current user's preferences from profiles table.
 * Returns default preferences if no profile exists.
 *
 * @returns UserPreferences object
 * @throws 401 if unauthenticated
 * @throws 500 on database errors
 */
export async function GET() {
  try {
    // Authenticate user
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Fetch user profile
    const { data: profile, error: dbError } = await supabase
      .from('profiles')
      .select('preferences')
      .eq('user_id', user.id)
      .single()

    // If no profile exists, return defaults
    if (dbError?.code === 'PGRST116' || !profile) {
      return NextResponse.json(DEFAULT_PREFERENCES)
    }

    // Handle other database errors
    if (dbError) {
      console.error('Database error fetching preferences:', dbError)
      return NextResponse.json(
        { error: 'Failed to fetch preferences' },
        { status: 500 }
      )
    }

    // Return stored preferences or defaults if empty
    const preferences = profile.preferences as UserPreferences
    return NextResponse.json(
      Object.keys(preferences).length > 0 ? preferences : DEFAULT_PREFERENCES
    )
  } catch (error) {
    console.error('Preferences GET error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/preferences
 *
 * Updates current user's preferences in profiles table.
 * Creates profile if it doesn't exist (upsert).
 *
 * @param request.body UserPreferences object
 * @returns Updated UserPreferences
 * @throws 400 if invalid payload
 * @throws 401 if unauthenticated
 * @throws 500 on database errors
 */
export async function PUT(request: NextRequest) {
  try {
    // Authenticate user
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Parse and validate request body
    let preferences: unknown
    try {
      preferences = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      )
    }

    if (!validatePreferences(preferences)) {
      return NextResponse.json(
        { error: 'Invalid preferences structure' },
        { status: 400 }
      )
    }

    // Upsert profile with new preferences
    const { data: profile, error: dbError } = await supabase
      .from('profiles')
      .upsert(
        {
          id: user.id,
          user_id: user.id,
          preferences: preferences,
        },
        {
          onConflict: 'user_id',
        }
      )
      .select('preferences')
      .single()

    if (dbError) {
      console.error('Database error updating preferences:', dbError)
      return NextResponse.json(
        { error: 'Failed to update preferences' },
        { status: 500 }
      )
    }

    return NextResponse.json(profile.preferences as UserPreferences)
  } catch (error) {
    console.error('Preferences PUT error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
