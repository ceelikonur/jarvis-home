'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { useBudgetStore } from '@/lib/stores/budget-store'
import { useSettingsStore } from '@/lib/stores/settings-store'
import { useCategoriesStore } from '@/lib/stores/categories-store'
import { formatCurrency } from '@/lib/utils/currency'

interface Props {
  selectedCategory: string | null
  onSelectCategory: (category: string | null) => void
}

export function CategoryBreakdown({ selectedCategory, onSelectCategory }: Props) {
  const { selectedPeriod, selectedPayPeriodIndex } = useSettingsStore()
  const { getCategoryTotals, getMonths, getPayPeriods } = useBudgetStore()
  const { categories } = useCategoriesStore()

  const months = getMonths()
  const currentMonth = months[selectedPeriod.month - 1] || months[0] || ''
  const periods = getPayPeriods()
  const activePeriod = selectedPayPeriodIndex !== null
    ? periods.find(p => p.index === selectedPayPeriodIndex) ?? undefined
    : undefined
  const filter = activePeriod ?? currentMonth
  const label = activePeriod ? activePeriod.shortLabel : (currentMonth || 'Tümü')

  const totals = getCategoryTotals(filter).filter(t => t.category !== 'Gelir')

  const data = totals.map(t => {
    const cat = categories.find(c => c.name === t.category)
    return { name: t.category, amount: Math.round(t.total * 100) / 100, fill: cat?.color || '#94a3b8' }
  })

  function handleClick(entry: { name?: string }) {
    if (entry?.name) onSelectCategory(selectedCategory === entry.name ? null : entry.name)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kategori Dağılımı — {label}</CardTitle>
        <p className="text-xs text-muted-foreground">Alt kırılımı görmek için bir kategoriye tıkla</p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={data} layout="vertical" margin={{ left: 30 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" tickFormatter={(v) => `€${v}`} />
            <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(value) => formatCurrency(Number(value))} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
            <Bar dataKey="amount" radius={[0, 4, 4, 0]} className="cursor-pointer" onClick={handleClick}>
              {data.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.fill}
                  fillOpacity={selectedCategory && selectedCategory !== entry.name ? 0.35 : 1}
                  stroke={selectedCategory === entry.name ? '#0f172a' : undefined}
                  strokeWidth={selectedCategory === entry.name ? 1.5 : 0}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
