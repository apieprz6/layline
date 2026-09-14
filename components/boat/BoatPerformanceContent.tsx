'use client'

import { useState, type ReactElement } from 'react'
import EmptyState from '@/components/common/EmptyState'
import SectionTabs, { tabPanelId } from '@/components/common/SectionTabs'
import { spacing } from '@/lib/utils/design'

type Tab = 'races' | 'overall'

const TABS = [
  { id: 'races', label: 'Races' },
  { id: 'overall', label: 'Overall' },
] as const satisfies readonly { id: Tab; label: string }[]

/**
 * **Boat performance**, once the padlock is off: the final shape of the section,
 * with nothing in it yet.
 *
 * Both tabs ship now, empty, because the navigation shape is being built once so
 * that nothing moves when the analysis effort follows. **Races** is empty because
 * the archive is — no **Race** has been uploaded, and the owner enters the archive
 * by hand through the finished UI. **Overall** is empty because the engine that
 * would fill it does not exist, which is Wind Data's Model Forecast tab exactly
 * (ADR 0016).
 *
 * Neither is a loading state, and the copy is what makes that legible: a sailor
 * who waits on this screen is waiting for nothing.
 */
export default function BoatPerformanceContent(): ReactElement {
  const [activeTab, setActiveTab] = useState<Tab>('races')

  return (
    <div className="min-h-screen" style={{ background: 'var(--page-bg)' }}>
      <SectionTabs
        title="Boat performance"
        tabs={TABS}
        activeTab={activeTab}
        onSelect={setActiveTab}
      />

      <div role="tabpanel" id={tabPanelId(activeTab)} style={{ padding: spacing(4) }}>
        {activeTab === 'races' ? (
          <EmptyState
            mark="⛵"
            title="No races uploaded yet"
            detail="Races appear here once one has been logged, newest first."
          />
        ) : (
          <EmptyState
            mark="📈"
            title="Season figures coming soon"
            detail="Counts and sums across the whole archive will be summarised here."
          />
        )}
      </div>
    </div>
  )
}
