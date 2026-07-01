'use client'

import { useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSettingsStore } from '@/lib/stores/settings-store'
import { useBudgetStore } from '@/lib/stores/budget-store'

// Topbar dönem gezgini — maaş dönemleri (Dönem 1 → 2 → ...) arasında gezer.
// selectedPayPeriodIndex'i set eder; tüm analiz/özet grafikleri bunu takip eder.
export function PeriodPicker() {
  const { selectedPayPeriodIndex, setSelectedPayPeriodIndex } = useSettingsStore()
  const { getPayPeriods } = useBudgetStore()
  const periods = getPayPeriods()

  // İlk açılışta (veya seçili dönem yoksa) aktif döneme ayarla
  const activeIndex = periods.length > 0 ? periods[periods.length - 1].index : null
  useEffect(() => {
    if (activeIndex !== null && selectedPayPeriodIndex === null) {
      setSelectedPayPeriodIndex(activeIndex)
    }
  }, [activeIndex, selectedPayPeriodIndex, setSelectedPayPeriodIndex])

  if (periods.length === 0) {
    return <span className="text-sm text-muted-foreground">Dönem verisi yok</span>
  }

  const currentIndex = selectedPayPeriodIndex ?? activeIndex
  const pos = Math.max(0, periods.findIndex(p => p.index === currentIndex))
  const current = periods[pos]

  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="icon" onClick={() => pos > 0 && setSelectedPayPeriodIndex(periods[pos - 1].index)} disabled={pos <= 0}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <div className="text-center min-w-[170px] leading-tight">
        <div className="text-sm font-medium">{current.shortLabel}{current.isActive ? ' · aktif' : ''}</div>
        <div className="text-[11px] text-muted-foreground">{current.label}</div>
      </div>
      <Button variant="ghost" size="icon" onClick={() => pos < periods.length - 1 && setSelectedPayPeriodIndex(periods[pos + 1].index)} disabled={pos >= periods.length - 1}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  )
}
