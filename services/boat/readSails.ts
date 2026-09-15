import { createClient } from '@/lib/supabase/server'
import type { SailChoice } from '@/types'

/**
 * The boat's Sail Inventory, in the order the sailor thinks of it.
 *
 * `sails.sort_order` is that order — main, jibs by number, kites — and it is the database's because
 * the same order has to hold on the chips, in a stored Sail Configuration and on a race's page. A set
 * rendered in tap order reads as two sail plans where there is one.
 *
 * Every sail comes back, retired ones included, and the *caller* decides which to offer. A sail
 * retired in March was still flown in February, and the archive being hand-entered means most races
 * annotated here are older than the locker is. Hiding a retired sail from a picker would make an
 * honest answer unavailable.
 *
 * Read by every signed-in sailor: `sails` has a SELECT policy for `authenticated` with no Role test,
 * because Role governs writes only (ADR 0019).
 */

/** Empty is not the same answer as null, and neither is a sail. */
export async function readSails(): Promise<SailChoice[] | null> {
  let supabase: Awaited<ReturnType<typeof createClient>>

  try {
    supabase = await createClient()
  } catch (thrown: unknown) {
    console.error(
      'Sails: Supabase client unavailable:',
      thrown instanceof Error ? thrown.message : thrown
    )
    return null
  }

  const { data, error } = await supabase
    .from('sails')
    .select('id, key, label, retired_on')
    .order('sort_order', { ascending: true })
    .returns<SailChoice[]>()

  if (error) {
    console.error('Sails: read failed:', error.message)
    return null
  }

  return data ?? []
}
