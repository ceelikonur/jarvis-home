'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useBudgetStore } from '@/lib/stores/budget-store'
import { useSettingsStore } from '@/lib/stores/settings-store'
import { formatCurrency } from '@/lib/utils/currency'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

export function BudgetComparison() {
  const { selectedPeriod } = useSettingsStore()
  const { getMonthBudget, getMonths } = useBudgetStore()

  const months = getMonths()
  const currentMonth = months[selectedPeriod.month - 1] || months[0] || ''
  const budget = getMonthBudget(currentMonth)

  if (!budget || budget.categories.length === 0) return null

  const data = budget.categories
    .filter(c => c.projected !== 0 || c.actual !== 0)
    .map(c => ({
      name: c.name.length > 12 ? c.name.slice(0, 12) + '...' : c.name,
      fullName: c.name,
      'Öngörülen': Math.abs(c.projected),
      'Gerçekleşen': Math.abs(c.actual),
    }))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Öngörülen vs Gerçekleşen — {currentMonth}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" angle={-20} textAnchor="end" height={80} tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={(v) => `€${v}`} />
            <Tooltip formatter={(value) => formatCurrency(Number(value))} />
            <Legend />
            <Bar dataKey="Öngörülen" fill="#94a3b8" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Gerçekleşen" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
