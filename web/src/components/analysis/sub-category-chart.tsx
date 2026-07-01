'use client'

import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { useBudgetStore } from '@/lib/stores/budget-store'
import { useSettingsStore } from '@/lib/stores/settings-store'
import { formatCurrency } from '@/lib/utils/currency'

const COLORS = ['#3b82f6','#ef4444','#22c55e','#f97316','#8b5cf6','#06b6d4','#ec4899','#eab308','#14b8a6','#6366f1','#78716c','#a855f7','#10b981','#f43f5e','#0ea5e9']

export function SubCategoryChart() {
  const router = useRouter()
  const { selectedPeriod, selectedPayPeriodIndex } = useSettingsStore()
  const { getTagTotals, getMonths, getPayPeriods } = useBudgetStore()

  const months = getMonths()
  const currentMonth = months[selectedPeriod.month - 1] || months[0] || ''

  const periods = getPayPeriods()
  const activePeriod = selectedPayPeriodIndex !== null
    ? periods.find(p => p.index === selectedPayPeriodIndex) ?? undefined
    : undefined
  const filter = activePeriod ?? currentMonth

  const totals = getTagTotals(filter).filter(t => t.tag !== 'MAAŞ').slice(0, 12)

  const data = totals.map((t, i) => ({
    name: t.tag,
    amount: Math.round(t.total * 100) / 100,
    count: t.count,
    color: COLORS[i % COLORS.length],
  }))

  function handleClick(entry: { name?: string }) {
    if (entry.name) router.push(`/islemler?tag=${encodeURIComponent(entry.name)}`)
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>Etiket Dağılımı</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
          Bu dönem için etiket verisi yok
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Etiket Dağılımı — {activePeriod ? activePeriod.shortLabel : currentMonth || 'Tümü'}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={data} layout="vertical" margin={{ left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" tickFormatter={(v) => `€${v}`} fontSize={11} />
            <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(value, _, props) => [
                `${formatCurrency(Number(value))} (${props.payload?.count} işlem)`,
                'Harcama'
              ]}
            />
            <Bar dataKey="amount" radius={[0, 4, 4, 0]} className="cursor-pointer" onClick={handleClick}>
              {data.map((entry, index) => (
                <Cell key={index} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        {/* Tıklanabilir tag chips */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {data.map((entry) => (
            <button
              key={entry.name}
              onClick={() => handleClick(entry)}
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border hover:shadow-sm transition-all"
              style={{ borderColor: entry.color, color: entry.color }}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
              {entry.name}
              <span className="text-muted-foreground">({entry.count})</span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
