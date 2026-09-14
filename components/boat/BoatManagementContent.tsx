import type { ReactElement } from 'react'
import EmptyState from '@/components/common/EmptyState'
import { spacing } from '@/lib/utils/design'

/**
 * **Boat management**, once the padlock is off: the section's own shell, and
 * nothing in it yet.
 *
 * Its header will *be* the boat's identity — name and model, edited in place by an
 * **admin** — and beneath it the four **Boat Setup** artifacts, each with a "not
 * recorded" row. LAY-104 lands all of that against real `boats` rows. This ticket
 * is the navigation shape, so the route exists, opens for a signed-in sailor, and
 * says plainly that it is empty.
 *
 * No boat is named here either, and not out of caution: there is nothing to read
 * one from yet, and a placeholder name would be a value that looks like a record
 * and is not one.
 *
 * A Server Component — nothing on it is interactive until there is something to
 * edit.
 */
export default function BoatManagementContent(): ReactElement {
  return (
    <div className="min-h-screen" style={{ background: 'var(--page-bg)' }}>
      <div
        style={{
          background: 'var(--surface-raised)',
          borderBottom: '1px solid var(--surface-border)',
          padding: `${spacing(4)} ${spacing(4)}`,
        }}
      >
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '16px',
            fontWeight: 'var(--weight-bold)',
            color: 'var(--text-primary)',
            margin: 0,
          }}
        >
          Boat management
        </h1>
      </div>

      <div style={{ padding: spacing(4) }}>
        <EmptyState
          mark="⚓"
          title="Nothing recorded yet"
          detail="The boat's identity and its Polar, Crossover Chart, Rig Tune and Instrument Calibration will live here."
        />
      </div>
    </div>
  )
}
