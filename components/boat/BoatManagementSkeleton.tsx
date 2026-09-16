import type { ReactElement } from 'react'
import { SkeletonScreen, SkeletonText } from '@/components/common/Skeleton'
import { EYEBROW_STYLE } from '@/components/common/eyebrow'
import { BOAT_SETUP_LABEL, BOAT_SETUP_ORDER } from '@/lib/boat/artifacts'
import { spacing } from '@/lib/utils/design'

/**
 * Boat management while the boat is still being read.
 *
 * This is a `<Suspense>` fallback inside the page rather than a `loading.tsx`, and the
 * difference is the whole point: a `loading.tsx` is a boundary *above* the page, so the
 * page's first `await` — resolving the **Account** — would flush this skeleton to a
 * **Guest** and turn their redirect into a client-side one. ADR 0015 says a guest is
 * served no form of this screen, and a skeleton of it is a form of it. Inside the page,
 * the boundary sits after the guard: the account is resolved first and a guest is gone
 * before a pixel is written, and only a sailor who is entitled to the boat waits here,
 * for `readBoatSetup()`.
 *
 * The page stays `force-dynamic` for auth (ADR 0015/0018) and resolves the **Account**
 * before it reads a thing, so the auth hop is in front of this skeleton and the storage
 * read is behind it.
 *
 * What is drawn is what is already known: both eyebrows, and all four artifact names
 * from `BOAT_SETUP_LABEL`. There are always exactly four rows and they are always
 * these four (ADR 0012), so a bar in place of "Instrument Calibration" would be a bar
 * standing in for a constant. What *is* a bar is the boat's identity — no signed-out
 * screen may name the boat, and this screen does not yet know whether it is serving
 * one — and each row's Version line.
 *
 * A row's Version line is drawn at one line. An artifact with nothing recorded shows
 * a "Not recorded" badge on the row's right instead, at the same single line, so the
 * shift here is only between the two heights a *recorded* row can take.
 */
export default function BoatManagementSkeleton(): ReactElement {
  return (
    <SkeletonScreen
      label="Loading the boat"
      className="min-h-screen"
      style={{ background: 'var(--page-bg)' }}
    >
      <div
        style={{
          background: 'var(--surface-raised)',
          borderBottom: '1px solid var(--surface-border)',
          padding: `${spacing(4)} ${spacing(4)}`,
        }}
      >
        <div style={EYEBROW_STYLE}>Boat management</div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: spacing(3) }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            {/* The boat's name is an `h1`, which `globals.css` gives --leading-tight
                rather than the body's 1.5. */}
            <SkeletonText
              fontSize="var(--text-2xl)"
              lineHeight="var(--leading-tight)"
              width="62%"
            />
            <SkeletonText fontSize="var(--text-sm)" width="40%" />
          </div>
        </div>
      </div>

      <div style={{ padding: spacing(4) }}>
        <div style={EYEBROW_STYLE}>Boat setup</div>

        <div>
          {BOAT_SETUP_ORDER.map((kind) => (
            <div
              key={kind}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: spacing(3),
                width: '100%',
                padding: '13px 4px',
                borderBottom: '1px solid var(--surface-divider)',
              }}
            >
              <span style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                <span
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 'var(--text-base)',
                    fontWeight: 'var(--weight-semibold)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {BOAT_SETUP_LABEL[kind]}
                </span>
                <SkeletonText fontSize="var(--text-sm)" width="120px" />
              </span>
              <span
                aria-hidden="true"
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--text-base)',
                  color: 'var(--text-muted)',
                  flexShrink: 0,
                }}
              >
                ›
              </span>
            </div>
          ))}
        </div>
      </div>
    </SkeletonScreen>
  )
}
