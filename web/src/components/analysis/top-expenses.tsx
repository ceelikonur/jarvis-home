'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useBudgetStore } from '@/lib/stores/budget-store'
import { useSettingsStore } from '@/lib/stores/settings-store'
import { formatCurrency } from '@/lib/utils/currency'
import { isInPeriod } from '@/lib/utils/periods'

export function TopExpenses() {
  const { selectedPeriod, selectedPayPeriodIndex } = useSettingsStore()
  const { transactions, getMonths, getPayPeriods } = useBudgetStore()

  const months = getMonths()
  const currentMonth = months[selectedPeriod.month - 1] || months[0] || ''
  const periods = getPayPeriods()
  const activePeriod = selectedPayPeriodIndex !== null
    ? periods.find(p => p.index === selectedPayPeriodIndex) ?? undefined
    : undefined
  const periodLabel = activePeriod ? activePeriod.shortLabel : (currentMonth || 'Tümü')

  const inSelectedPeriod = (t: { date: Date; month: string }) =>
    activePeriod ? isInPeriod(new Date(t.date), activePeriod) : (!currentMonth || t.month === currentMonth)

  const expenses = transactions
    .filter(t => t.type === 'expense' && !t.is_internal && !t.is_savings && inSelectedPeriod(t))
    .sort((a, b) => a.amount - b.amount)
    .slice(0, 10)

  return (
    <Card>
      <CardHeader>
        <CardTitle>En Büyük Harcamalar — {periodLabel}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {expenses.map((tx, i) => {
            const date = new Date(tx.date)
            const dateStr = isNaN(date.getTime()) ? '-' : date.toLocaleDateString('tr-TR')
            return (
              <div key={i} className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm truncate max-w-[250px]">{tx.source}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">{dateStr}</span>
                    <Badge variant="secondary" className="text-xs">{tx.category}</Badge>
                  </div>
                </div>
                <span className="font-semibold text-sm text-red-600 whitespace-nowrap">{formatCurrency(tx.amount)}</span>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
