import type { ReactNode } from 'react'

interface StationLayoutProps {
  header: ReactNode
  polarChart: ReactNode
  speedChart: ReactNode
  tabbedPanel: ReactNode
  dock: ReactNode
}

export default function StationLayout({
  header,
  polarChart,
  speedChart,
  tabbedPanel,
  dock,
}: StationLayoutProps) {
  return (
    <div className="station-layout">
      {header}

      <div className="station-layout__scroll">
        <div className="station-layout__content">
          <div className="station-layout__polar">
            {polarChart}
          </div>
          <div className="station-layout__speed">
            {speedChart}
          </div>
          <div className="station-layout__tabbed">
            {tabbedPanel}
          </div>
        </div>
      </div>

      {dock}
    </div>
  )
}
