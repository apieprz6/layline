'use client'

import { useState, ReactNode } from 'react'
import RaceHeader from './RaceHeader'
import HamburgerMenu from './HamburgerMenu'
import { useTheme } from '@/lib/hooks/useTheme'

interface AppLayoutProps {
  children: ReactNode
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  useTheme()

  return (
    <div className="min-h-screen">
      <RaceHeader
        onOpenMenu={() => setMenuOpen(true)}
      />

      <HamburgerMenu
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
      />

      <div className="max-w-md mx-auto md:mx-0 md:max-w-none">
        {children}
      </div>
    </div>
  )
}
