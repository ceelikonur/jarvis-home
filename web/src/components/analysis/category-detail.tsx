'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { useBudgetStore } from '@/lib/stores/budget-store'
import { useSettingsStore } from '@/lib/stores/settings-store'
import { formatCurrency } from '@/lib/utils/currency'

const COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f97316', '#8b5cf6', '#06b6d4', '#ec4899', '#eab308', '#14b8a6', '#6366f1', '#78716c', '#a855f7']

interface Props {
  selectedCategory: string | null
}

export function CategoryDetail({ selectedCategory }: Props) {
  const router = useRouter()
  const [mode, setMode] = useState<'merchant' | 'tag'>('merchant')
  const { selectedPeriod, selectedPayPeriodIndex } = useSettingsStore()
  const { getMonths, getPayPeriods, getCategoryMerchantTotals, getCategoryTagTotals } = useBudgetStore()

  const months = getMonths()
  const currentMonth = months[selectedPeriod.month - 1] || months[0] || ''
  const periods = getPayPeriods()
  const activePeriod = selectedPayPeriodIndex !== null
    ? periods.find(p => p.index === selectedPayPeriodIndex) ?? undefined
    : undefined
  const filter = activePeriod ?? currentMonth
  const periodLabel = activePeriod ? activePeriod.shortLabel : (currentMonth || 'Tümü')
  const periodParam = activePeriod
    ? `period=${activePeriod.index}`
    : (currentMonth ? `month=${encodeURIComponent(currentMonth)}` : '')

  if (!selectedCategory) {
    return (
      <Card>
        <CardHeader><CardTitle>Kategori Detayı</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-center h-[340px] text-muted-foreground text-sm text-center px-8">
          Soldaki <span className="font-medium mx-1">Kategori Dağılımı</span>&apos;ndan bir kategoriye tıkla — satıcı/etiket kırılımı burada çıkar, oradan işlemlere inebilirsin.
        </CardContent>
      </Card>
    )
  }

  const rows = mode === 'merchant'
    ? getCategoryMerchantTotals(selectedCategory, filter).map(r => ({ name: r.merchant, total: r.total, count: r.count }))
    : getCategoryTagTotals(selectedCategory, filter).map(r => ({ name: r.tag, total: r.total, count: r.count }))
  const grand = rows.reduce((s, r) => s + r.total, 0)
  const data = rows.slice(0, 12).map((r, i) => ({ ...r, amount: Math.round(r.total * 100) / 100, color: COLORS[i % COLORS.length] }))

  function drill(name?: string) {
    if (!name) return
    const parts = [periodParam, `category=${encodeURIComponent(selectedCategory!)}`]
    if (mode === 'tag') parts.push(`tag=${encodeURIComponent(name)}`)
    else parts.push(`search=${encodeURIComponent(name)}`)
    router.push(`/islemler?${parts.filter(Boolean).join('&')}`)
  }

  const tabBtn = (active: boolean) =>
    `text-xs px-2.5 py-1 rounded ${active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="truncate">{selectedCategory}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">{formatCurrency(grand)} · {periodLabel}</p>
          </div>
          <div className="flex gap-0.5 rounded-md border p-0.5 shrink-0">
            <button onClick={() => setMode('merchant')} className={tabBtn(mode === 'merchant')}>Satıcı</button>
            <button onClick={() => setMode('tag')} className={tabBtn(mode === 'tag')}>Etiket</button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
            Bu dönemde bu kategoride işlem yok
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={(v) => `€${v}`} fontSize={11} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                <Tooltip
                  cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                  formatter={(value, _n, props) => [`${formatCurrency(Number(value))} (${props.payload?.count} işlem)`, 'Harcama']}
                />
                <Bar dataKey="amount" radius={[0, 4, 4, 0]} className="cursor-pointer" onClick={(e) => drill((e as { name?: string })?.name)}>
                  {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p className="text-xs text-muted-foreground mt-2">Bir çubuğa tıkla → o işlemleri İşlemler sayfasında detaylı gör</p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
