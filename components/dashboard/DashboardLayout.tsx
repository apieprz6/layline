'use client'

import { ReactNode } from 'react'
import BottomNav from './BottomNav'

interface DashboardLayoutProps {
  children: ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen pb-20">
      {/* Mobile-first container */}
      <div className="max-w-md mx-auto lg:max-w-7xl">
        {children}
      </div>
      <BottomNav />
    </div>
  )
}
