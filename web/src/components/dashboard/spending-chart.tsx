'use client'

import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { useBudgetStore } from '@/lib/stores/budget-store'
import { useSettingsStore } from '@/lib/stores/settings-store'
import { useCategoriesStore } from '@/lib/stores/categories-store'
import { formatCurrency } from '@/lib/utils/currency'

const SUB_COLORS = ['#3b82f6','#ef4444','#22c55e','#f97316','#8b5cf6','#06b6d4','#ec4899','#eab308','#14b8a6','#6366f1','#78716c','#a855f7','#10b981','#f43f5e','#0ea5e9']

export function SpendingChart() {
  const router = useRouter()
  const { selectedPeriod, selectedPayPeriodIndex } = useSettingsStore()
  const { getSubCategoryTotals, getMonths, getPayPeriods } = useBudgetStore()
  useCategoriesStore() // DB'den kategorileri yüklemek için bağlı kalıyoruz

  const months = getMonths()
  const currentMonth = months[selectedPeriod.month - 1] || months[0] || ''

  // Filter semantics: null = truly all (ignore topbar month)
  const periods = getPayPeriods()
  const activePeriod = selectedPayPeriodIndex !== null
    ? periods.find(p => p.index === selectedPayPeriodIndex) ?? undefined
    : undefined
  const showAll = selectedPayPeriodIndex === null
  const filter = showAll ? undefined : activePeriod

  // Sub-kategoriye göre pie — MAAŞ hariç
  const totals = getSubCategoryTotals(filter).filter(t => t.subCategory !== 'MAAŞ')

  const data = totals
    .slice(0, 12)
    .map((t, i) => ({
      name: t.subCategory || 'DİĞER',
      value: Math.round(t.total * 100) / 100,
      color: SUB_COLORS[i % SUB_COLORS.length],
    }))


  if (data.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>Harcama Dağılımı</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-center h-[300px] text-muted-foreground">
          Bu ay için veri yok
        </CardContent>
      </Card>
    )
  }

  function handleClick(_: unknown, index: number) {
    const cat = data[index]
    if (cat) {
      const params = new URLSearchParams({ type: 'expense', sub: cat.name })
      if (!showAll && currentMonth) params.set('month', currentMonth)
      router.push(`/islemler?${params.toString()}`)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Harcama Dağılımı — {showAll ? 'Tüm işlemler' : (activePeriod ? activePeriod.shortLabel : currentMonth)}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              dataKey="value"
              label={({ name, percent }) => `${name} %${((percent ?? 0) * 100).toFixed(0)}`}
              className="cursor-pointer"
              onClick={handleClick}
            >
              {data.map((entry, index) => (
                <Cell key={index} fill={entry.color} stroke={entry.color} strokeWidth={1} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => formatCurrency(Number(value))} />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex flex-wrap gap-2 mt-2 justify-center">
          {data.map((entry) => (
            <button
              key={entry.name}
              onClick={() => {
                const params = new URLSearchParams({ type: 'expense', sub: entry.name })
                if (!showAll && currentMonth) params.set('month', currentMonth)
                router.push(`/islemler?${params.toString()}`)
              }}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
              {entry.name}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
