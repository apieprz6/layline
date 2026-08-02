import { createClient as createSupabaseClient } from '@supabase/supabase-js'

let serviceClient: ReturnType<typeof createSupabaseClient> | null = null

export function getServiceClient() {
  if (serviceClient) return serviceClient

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables')
  }

  serviceClient = createSupabaseClient(supabaseUrl, supabaseKey)
  return serviceClient
}
