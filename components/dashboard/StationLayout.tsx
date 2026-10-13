import type { ReactNode } from 'react'

interface StationLayoutProps {
  header: ReactNode
  windRose: ReactNode
  speedChart: ReactNode
  statsPanel: ReactNode
  dock: ReactNode
}

export default function StationLayout({
  header,
  windRose,
  speedChart,
  statsPanel,
  dock,
}: StationLayoutProps) {
  return (
    <div className="station-layout">
      {header}

      <div className="station-layout__scroll">
        <div className="station-layout__content">
          <div className="station-layout__wind-rose">
            {windRose}
          </div>
          <div className="station-layout__speed">
            {speedChart}
          </div>
          <div className="station-layout__stats">
            {statsPanel}
          </div>
        </div>
      </div>

      {dock}
    </div>
  )
}
