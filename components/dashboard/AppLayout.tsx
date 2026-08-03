'use client'

import { useState, ReactNode } from 'react'
import RaceHeader from './RaceHeader'
import HamburgerMenu from './HamburgerMenu'
import { useTheme } from '@/lib/hooks/useTheme'

interface AppLayoutProps {
  children: ReactNode
  raceTime: Date
  currentWind: {
    speed: number
    direction: number
  }
}

export default function AppLayout({ children, raceTime, currentWind }: AppLayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  useTheme()

  return (
    <div className="min-h-screen">
      <RaceHeader
        raceTime={raceTime}
        currentWind={currentWind}
        onOpenMenu={() => setMenuOpen(true)}
      />

      <HamburgerMenu
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
      />

      <div className="max-w-md mx-auto lg:max-w-7xl">
        {children}
      </div>
    </div>
  )
}
