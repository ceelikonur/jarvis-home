'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useBudgetStore } from '@/lib/stores/budget-store'
import { useSettingsStore } from '@/lib/stores/settings-store'
import { formatCurrency } from '@/lib/utils/currency'
import { Progress } from '@/components/ui/progress'

export function PersonBreakdown() {
  const { selectedPeriod } = useSettingsStore()
  const { getPersonTotals, getMonths } = useBudgetStore()

  const months = getMonths()
  const currentMonth = months[selectedPeriod.month - 1] || months[0] || ''
  const totals = getPersonTotals(currentMonth)
  const grandTotal = totals.reduce((s, t) => s + t.total, 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kişi Bazlı Harcama — {currentMonth || 'Tümü'}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {totals.map(t => {
          const percent = grandTotal > 0 ? (t.total / grandTotal) * 100 : 0
          return (
            <div key={t.person}>
              <div className="flex justify-between mb-1">
                <span className="text-sm font-medium">{t.person}</span>
                <span className="text-sm text-muted-foreground">{formatCurrency(t.total)} ({t.count} işlem)</span>
              </div>
              <Progress value={percent} className="h-2" />
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
