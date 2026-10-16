import { createClient } from '@/lib/supabase/server'
import type { BoatHeaderIdentity } from '@/types'

/**
 * The boat as the signed-in header names it: its name, and the key its icon is cached under.
 *
 * Called by the `(app)` layout only once it holds an **Account** — a **Guest** costs no read at
 * all, because no signed-out screen names the boat (ADR 0015) and a value never read cannot leak.
 *
 * `null` when the row cannot be read, and the header falls back to the layline wordmark: the chrome
 * around every screen is no place to fail a request over a name. The reason goes to the log.
 */
export async function readBoatHeaderIdentity(): Promise<BoatHeaderIdentity | null> {
  try {
    const supabase = await createClient()

    const { data: boat, error } = await supabase
      .from('boats')
      .select('name, icon_updated_at')
      .maybeSingle<{ name: string; icon_updated_at: string | null }>()

    if (error) {
      console.error('Boat header: boats read failed:', error.message)
      return null
    }

    // `boats_singleton` and the seed guarantee a row, so none means RLS hid it or the migration
    // has not run — neither is a boat to name.
    if (!boat) {
      console.error('Boat header: no boat row is readable')
      return null
    }

    return { name: boat.name, iconUpdatedAt: boat.icon_updated_at }
  } catch (thrown: unknown) {
    console.error(
      'Boat header: read failed:',
      thrown instanceof Error ? thrown.message : thrown
    )
    return null
  }
}
