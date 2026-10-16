import type { ReactElement, ReactNode } from 'react'
import { boatIconUrl } from '@/lib/boat/icon'
import { spacing } from '@/lib/utils/design'

interface BoatIdentityHeaderProps {
  name: string
  model: string
  /** The boat's `icon_updated_at`, or null when it has no icon — which draws none. */
  iconUpdatedAt?: string | null
  /** An edit affordance, for an admin. Nothing at all for anybody else. */
  action?: ReactNode
}

/**
 * The boat's identity, which is also the header of Boat management.
 *
 * Not Settings. No signed-out screen may name the boat, so identity is edited here
 * rather than anywhere a Guest can reach — and the section's own name is the eyebrow its container renders above
 * this, precisely so the `h1` can be the boat, which is what a sailor arriving here
 * is looking at.
 *
 * Presentational and unmarked, so both the read-only server render and the admin's
 * client editor can use the same header rather than two that resemble each other.
 */
export default function BoatIdentityHeader({
  name,
  model,
  iconUpdatedAt = null,
  action,
}: BoatIdentityHeaderProps): ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: spacing(3) }}>
      {iconUpdatedAt !== null && (
        // eslint-disable-next-line @next/next/no-img-element -- a private, cache-keyed route
        <img
          src={boatIconUrl(iconUpdatedAt)}
          width={48}
          height={48}
          alt=""
          style={{ borderRadius: 'var(--radius-md)', objectFit: 'cover', flexShrink: 0 }}
        />
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <h1
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-2xl)',
            fontWeight: 'var(--weight-bold)',
            letterSpacing: '-0.02em',
            color: 'var(--text-primary)',
          }}
        >
          {name}
        </h1>
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-sm)',
            color: 'var(--text-muted)',
          }}
        >
          {model}
        </div>
      </div>
      {action}
    </div>
  )
}
