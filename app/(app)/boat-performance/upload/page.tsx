import type { ReactElement } from 'react'
import RaceUploadWizard from '@/components/race-upload/RaceUploadWizard'
import { canWrite } from '@/lib/account/canWrite'
import { resolveAccount } from '@/lib/account/resolveAccount'
import { signInFirst } from '@/lib/account/signInFirst'
import { spacing } from '@/lib/utils/design'

import { stageRecording, submitRace } from './actions'

export const dynamic = 'force-dynamic'

/**
 * **Upload a race** — an admin screen behind a signed-in one.
 *
 * Two refusals, in order. A **Guest** is sent back to the dashboard with the **Auth Sheet** open and
 * this route remembered, so nothing about the archive is served to someone who is not signed in
 * (ADR 0015). A signed-in sailor who is not an admin is told so plainly and shown nothing else: Role
 * governs writes, and uploading is the write (ADR 0019).
 *
 * The two Server Actions are passed to the wizard as props rather than imported by it. That keeps the
 * wizard a plain client component with an injectable seam — a test drives the whole three-step flow
 * against two stubs — and it keeps the `'use server'` module out of the client bundle's import graph
 * except as the two references Next replaces with endpoints.
 *
 * Both actions re-check the Role anyway. This page decides what to render; a Server Action is a public
 * endpoint and decides for itself.
 */
export default async function RaceUploadPage(): Promise<ReactElement> {
  const account = await resolveAccount()

  if (!account) signInFirst('/boat-performance/upload')

  if (!canWrite(account)) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--page-bg)', padding: spacing(4) }}>
        <h1
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-lg)',
            color: 'var(--text-primary)',
          }}
        >
          Only an admin can upload a race
        </h1>
        <p style={{ marginTop: spacing(2), fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
          Every race in the archive is readable by every signed-in sailor. Adding one is the boat
          owner’s job.
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--page-bg)' }}>
      <RaceUploadWizard stageRecording={stageRecording} submitRace={submitRace} />
    </div>
  )
}
