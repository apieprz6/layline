import type { ReactNode } from 'react'

interface MobileStationLayoutProps {
  header: ReactNode
  children: ReactNode
  dock: ReactNode
}

export default function MobileStationLayout({
  header,
  children,
  dock,
}: MobileStationLayoutProps) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--surface-base)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      {/* Sticky header area */}
      {header}

      {/* Scrollable content area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '14px 16px 0 16px',
          paddingBottom: 'calc(180px + 16px)', // Dock height (~180px) + spacing
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          {children}
        </div>
      </div>

      {/* Fixed bottom dock */}
      {dock}
    </div>
  )
}
