'use client'

import { MobileSidebar } from '@/components/layout/sidebar'
import { PeriodPicker } from '@/components/shared/period-picker'

export function Topbar() {
  return (
    <div className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b bg-white px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8">
      <MobileSidebar />
      <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
        <div className="flex flex-1 items-center">
          <PeriodPicker />
        </div>
      </div>
    </div>
  )
}
