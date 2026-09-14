'use client'

import type { CSSProperties, ReactElement } from 'react'
import { useOpenAuthSheet } from '@/components/auth/authSheetOpener'

interface LockedBoatScreenProps {
  /** The section's own name, matching its drawer row exactly. */
  title: string
  /** One line on what signing in would let them read. It names no boat. */
  invitation: string
}

/**
 * The hatch: this repo's first "obviously not a value" treatment, and meant to be
 * the archive's "not recorded" one too when that lands, so the two absences read as
 * the same kind of thing. Nothing to borrow from yet — the prototype's locked screen
 * reached for `filter: blur(4px)`, which ADR 0015 forbids, so this is new.
 *
 * Drawn from `--surface-border` rather than a literal `rgba(0,0,0,…)` so it
 * survives Night Vision, where black-on-near-black would vanish.
 */
const HATCH = 'repeating-linear-gradient(135deg, var(--surface-border) 0 4px, transparent 4px 8px)'

const placeholderBox: CSSProperties = {
  background: HATCH,
  border: '1px dashed var(--surface-border-hover)',
  borderRadius: 'var(--radius-xs)',
}

/**
 * One bar per placeholder card, proportions only, and deliberately not the
 * proportions of anything real.
 */
const BAR_WIDTHS = ['58%', '44%', '66%']

/**
 * Geometry where the content would be.
 *
 * Not blurred data and not a skeleton waiting on a fetch — there is no fetch. A
 * value that looks like a reading and is not one is worse than an obvious
 * absence, which is why this is hatched rather than softened, and why it is
 * `aria-hidden`: it says nothing, so it should say nothing out loud either.
 */
function PlaceholderGeometry(): ReactElement {
  return (
    <div
      data-testid="locked-placeholder"
      aria-hidden
      style={{ display: 'flex', flexDirection: 'column', gap: '10px', margin: '18px 0 22px' }}
    >
      {BAR_WIDTHS.map((width) => (
        <div
          key={width}
          style={{
            border: '1px dashed var(--surface-border-hover)',
            borderRadius: 'var(--card-radius)',
            background: HATCH,
            padding: '14px',
          }}
        >
          <div style={{ ...placeholderBox, height: '10px', width, marginBottom: '10px' }} />
          <div style={{ ...placeholderBox, height: '34px' }} />
        </div>
      ))}
    </div>
  )
}

/**
 * A **Locked Entry**'s screen: what a **Guest** gets when they tap a padlocked
 * boat row, or deep-link straight to one.
 *
 * It is a screen and not a redirect. ADR 0015 requires that a tap explain and
 * invite — no 404, no middleware redirect and no bounce to a login page, Layline
 * having none by decision — so this route renders for everyone, and the sailor
 * who asked for it is still standing on it after they sign in.
 *
 * Behind the lock is geometry. Nothing about the boat, including its name, is on
 * any signed-out screen: the drawer advertises that a boat exists here, not whose.
 */
export default function LockedBoatScreen({
  title,
  invitation,
}: LockedBoatScreenProps): ReactElement {
  // The sheet is mounted in the app layout, so it opens over this screen rather
  // than sending the sailor to the dashboard to sign in (ADR 0016).
  const openAuthSheet = useOpenAuthSheet()

  return (
    // The same page frame the unlocked shells use: signing in changes what is on
    // this screen, and should not also change the screen's own footprint.
    <div className="min-h-screen" style={{ background: 'var(--page-bg)' }}>
      <div data-testid="locked-screen" style={{ padding: '24px 16px 40px', maxWidth: '480px' }}>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-xl)',
            fontWeight: 'var(--weight-bold)',
            color: 'var(--text-primary)',
            letterSpacing: 'var(--tracking-tight)',
            margin: '0 0 6px',
          }}
        >
          {title}
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-base)',
            color: 'var(--text-muted)',
            margin: 0,
          }}
        >
          {invitation}
        </p>

        <PlaceholderGeometry />

        <button
          onClick={openAuthSheet}
          style={{
            width: '100%',
            padding: '14px 16px',
            borderRadius: 'var(--btn-primary-radius)',
            border: 'none',
            background: 'var(--btn-primary-bg)',
            color: 'var(--btn-primary-fg)',
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-base)',
            fontWeight: 'var(--weight-semibold)',
            cursor: 'pointer',
          }}
        >
          Sign in
        </button>

        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-sm)',
            color: 'var(--text-muted)',
            lineHeight: 1.5,
            margin: '14px 0 0',
          }}
        >
          Those shapes are placeholders, not this boat&rsquo;s data.
        </p>
      </div>
    </div>
  )
}
