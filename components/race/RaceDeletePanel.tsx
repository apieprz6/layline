'use client'

import { useRouter } from 'next/navigation'
import { useState, type CSSProperties, type ReactElement } from 'react'
import { EYEBROW_STYLE } from '@/components/common/eyebrow'
import { spacing } from '@/lib/utils/design'
import type { DeleteRaceResult } from '@/types'

/**
 * Deleting a race, in two steps — the pattern the artifact upload form uses, turned around.
 *
 * The first press only asks. It has to: this delete takes the Race, both kinds of annotation, the
 * **Transcription** and the stored bytes, and none of it comes back. Re-creating the race means
 * finding the export again, re-uploading it, re-setting the window and re-typing every sail and
 * sea-state entry. So the confirmation names all of it rather than asking "are you sure?", which is a
 * question nobody reads.
 *
 * The confirmation is the only guard, and that is a deliberate proportion for a single-admin tool
 * (LAY-112). There is no typed-in filename and no second dialog; the account is the boat owner's, RLS
 * refuses everyone else, and a delete that took four presses would be one nobody trusted enough to
 * use on the race they meant to remove.
 *
 * A Client Component, because the two steps are one screen and the second one has to know the first
 * happened.
 *
 * The action arrives as a prop rather than being imported here, matching the upload wizard: it keeps
 * this an injectable seam a test can drive, and it keeps the `'use server'` module out of this
 * component's import graph.
 *
 * It belongs to the Race detail page and nowhere else. Annotating a race changes a Race; it may never
 * destroy a **Transcription**, so no annotation surface renders this — and if one ever imports it, the
 * cascade still only runs downhill (`scripts/verify-race-delete-cascade.sql`, section 6), which is the
 * guarantee that does not depend on where a component was put.
 *
 * No Playwright spec, and not by omission: the panel is drawn for a signed-in admin only, and the OAuth
 * round trip cannot be automated (docs/testing/README.md). So the two steps are asserted in Jest, and
 * the 390px note in the styles below is stated intent rather than something a browser measured.
 */

interface RaceDeletePanelProps {
  raceId: string
  /** The Recording's verbatim filename — what the sailor would have to find again. */
  filename: string
  deleteRace: (raceId: string) => Promise<DeleteRaceResult>
}

export default function RaceDeletePanel({
  raceId,
  filename,
  deleteRace,
}: RaceDeletePanelProps): ReactElement {
  const router = useRouter()
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [orphanedBytes, setOrphanedBytes] = useState(false)

  async function onConfirm(): Promise<void> {
    setBusy(true)
    setMessage(null)

    const result = await deleteRace(raceId)

    if (!result.ok) {
      setMessage(result.message)
      setBusy(false)
      return
    }

    if (!result.bytes_removed) {
      // The race is gone and its bytes are not, which is ADR 0013's chosen failure rather than an
      // error. Said out loud and the navigation dropped: sending the admin to the races list would
      // take this note with it, and they are the one person who can run the sweeper.
      setAsking(false)
      setOrphanedBytes(true)
      setBusy(false)
      return
    }

    // `busy` stays true through the navigation, so the button cannot be pressed a second time at a
    // race that is already gone.
    router.push('/boat-performance')
  }

  if (orphanedBytes) {
    return (
      <section style={PANEL_STYLE}>
        <div style={EYEBROW_STYLE}>Deleted</div>
        <p data-testid="race-delete-orphan" role="status" style={BODY_STYLE}>
          The race, its entries and its Transcription are gone. The stored file could not be removed
          and is still in the bucket — nothing points at it now, and the sweeper will clear it.
        </p>
      </section>
    )
  }

  return (
    <section style={PANEL_STYLE}>
      <div style={EYEBROW_STYLE}>Delete</div>

      {!asking && (
        <>
          <p style={BODY_STYLE}>
            A race that should not be in the archive can be removed. It takes everything with it.
          </p>
          <button
            type="button"
            data-testid="race-delete-open"
            onClick={() => {
              setMessage(null)
              setAsking(true)
            }}
            style={OPEN_STYLE}
          >
            Delete this race
          </button>
        </>
      )}

      {asking && (
        <div data-testid="race-delete-confirmation">
          <p style={{ ...BODY_STYLE, fontWeight: 'var(--weight-semibold)' }}>
            Delete this race permanently?
          </p>
          {/* Every noun the delete actually takes. The file is named because finding it again is the
              first thing re-creating this race would need. */}
          <p style={BODY_STYLE}>
            This removes the race and its sail and sea-state entries, the Transcription of{' '}
            <span style={{ fontFamily: 'var(--font-mono)', overflowWrap: 'anywhere' }}>
              {filename}
            </span>
            , and the stored file itself. There is no undo: putting it back means uploading the file
            again, setting the window again and re-typing every entry.
          </p>

          <div style={ACTIONS_STYLE}>
            <button
              type="button"
              data-testid="race-delete-confirm"
              disabled={busy}
              onClick={() => void onConfirm()}
              style={CONFIRM_STYLE}
            >
              {busy ? 'Deleting…' : 'Delete permanently'}
            </button>
            <button
              type="button"
              data-testid="race-delete-cancel"
              disabled={busy}
              onClick={() => setAsking(false)}
              style={CANCEL_STYLE}
            >
              Keep this race
            </button>
          </div>
        </div>
      )}

      {message !== null && (
        <p data-testid="race-delete-error" role="alert" style={ERROR_STYLE}>
          {message}
        </p>
      )}
    </section>
  )
}

const PANEL_STYLE: CSSProperties = {
  padding: spacing(4),
  background: 'var(--surface-raised)',
  // The one card on the page whose border is the storm colour, because it is the one card that
  // destroys something.
  border: '1px solid var(--wind-storm)',
  borderRadius: 'var(--radius-md)',
}

const BODY_STYLE: CSSProperties = {
  margin: `${spacing(2)} 0 0`,
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-primary)',
}

const ACTIONS_STYLE: CSSProperties = {
  display: 'flex',
  // Wraps at 390px rather than squeezing two full-height buttons onto one line.
  flexWrap: 'wrap',
  gap: spacing(3),
  marginTop: spacing(4),
}

/** Outlined, not filled: the first press is a question, and only the second one is the act. */
const OPEN_STYLE: CSSProperties = {
  marginTop: spacing(4),
  // A thumb's worth of height, like every other action in the app.
  padding: '11px 16px',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-base)',
  fontWeight: 'var(--weight-semibold)',
  color: 'var(--wind-storm)',
  background: 'var(--btn-ghost-bg)',
  border: '1px solid var(--wind-storm)',
  borderRadius: 'var(--btn-primary-radius)',
  cursor: 'pointer',
}

const CONFIRM_STYLE: CSSProperties = {
  padding: '11px 16px',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-base)',
  fontWeight: 'var(--weight-semibold)',
  color: 'var(--text-inverse)',
  background: 'var(--wind-storm)',
  border: '1px solid var(--wind-storm)',
  borderRadius: 'var(--btn-primary-radius)',
  cursor: 'pointer',
}

const CANCEL_STYLE: CSSProperties = {
  padding: '11px 16px',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-base)',
  color: 'var(--btn-ghost-fg)',
  background: 'var(--btn-ghost-bg)',
  border: '1px solid var(--btn-ghost-border)',
  borderRadius: 'var(--btn-primary-radius)',
  cursor: 'pointer',
}

const ERROR_STYLE: CSSProperties = {
  margin: `${spacing(3)} 0 0`,
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  color: 'var(--wind-storm)',
}
