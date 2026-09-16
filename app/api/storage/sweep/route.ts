import { NextResponse } from 'next/server'
import { canWrite } from '@/lib/account/canWrite'
import { resolveAccount } from '@/lib/account/resolveAccount'
import { createClient } from '@/lib/supabase/server'
import { runSweep } from '@/services/storage/runSweep'

/**
 * POST /api/storage/sweep
 *
 * Collects the objects ADR 0013 leaves behind — an abandoned upload wizard, a commit that failed
 * after the bytes moved, a delete that failed after the row went — and answers with what it did.
 *
 * On demand and by hand, which is the whole design. Nothing in Layline is broken while an orphan
 * sits in the bucket: it is invisible to every screen, costs a few kilobytes, and the only cost of
 * waiting is bucket space. That makes a cron job the wrong shape for a boat owner's tool — the
 * person who deletes a race is the person who can run this, and they can run it while looking at
 * the answer.
 *
 * POST rather than GET because it destroys things: no prefetch, no crawler and no pasted URL starts
 * a sweep. Admin only, checked here rather than left to the Storage policies — those would refuse
 * the deletes, but a viewer would still get a report of a bucket that looked clean to them.
 *
 * The report is the point. "Removed nothing" and "could not tell what to remove" are different
 * answers and are never conflated: the sweep throws rather than reporting an empty run it did not
 * actually make.
 */
// No parameters: the sweep takes no input at all. What it removes is decided from the bucket and the
// `recordings` table, so there is no body to read and nothing a caller could ask it to widen.
export async function POST(): Promise<Response> {
  try {
    const account = await resolveAccount()

    if (!account) {
      return NextResponse.json({ error: 'Sign in to sweep storage' }, { status: 401 })
    }

    if (!canWrite(account)) {
      return NextResponse.json({ error: 'Only an admin can sweep storage' }, { status: 403 })
    }

    const supabase = await createClient()
    const report = await runSweep(supabase)

    if (report.removed.length > 0 || report.failed.length > 0) {
      // A sweep that found something is a write path that failed earlier, so it is worth a line in
      // the log as well as a line on the screen.
      console.warn(
        `Sweep: removed ${report.removed.length} orphaned object(s), ${report.failed.length} could not be removed`
      )
    }

    // Never cached: the answer is a description of one moment in the bucket.
    return NextResponse.json(report, { headers: { 'Cache-Control': 'no-store' } })
  } catch (thrown: unknown) {
    console.error('Sweep error:', thrown)
    return NextResponse.json(
      { error: thrown instanceof Error ? thrown.message : 'The sweep could not be run' },
      { status: 500 }
    )
  }
}
