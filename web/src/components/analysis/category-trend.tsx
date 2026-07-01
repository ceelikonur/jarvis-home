'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { useBudgetStore } from '@/lib/stores/budget-store'
import { useCategoriesStore } from '@/lib/stores/categories-store'
import { formatCurrency } from '@/lib/utils/currency'

interface Props {
  selectedCategory: string | null
}

export function CategoryTrend({ selectedCategory }: Props) {
  const { getCategoriesPeriodSeries } = useBudgetStore()
  const { categories } = useCategoriesStore()
  const series = getCategoriesPeriodSeries()

  if (series.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>Kategori Dönem Trendi</CardTitle></CardHeader>
        <CardContent className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
          Trend için yeterli maaş dönemi verisi yok
        </CardContent>
      </Card>
    )
  }

  // Toplam harcamaya göre en çok 6 kategori (seçili kategori varsa garanti dahil)
  const grand: Record<string, number> = {}
  series.forEach(row => { for (const [c, v] of Object.entries(row.totals)) grand[c] = (grand[c] || 0) + v })
  let cats = Object.entries(grand).sort((a, b) => b[1] - a[1]).map(([c]) => c).slice(0, 6)
  if (selectedCategory && !cats.includes(selectedCategory)) cats = [selectedCategory, ...cats].slice(0, 6)

  const colorOf = (c: string) => categories.find(x => x.name === c)?.color || '#94a3b8'

  const data = series.map(row => {
    const o: Record<string, number | string> = { period: row.period }
    cats.forEach(c => { o[c] = Math.round((row.totals[c] || 0) * 100) / 100 })
    return o
  })

  // Seçili kategori için değişim istatistikleri (ilk → son dönem)
  let stats: { first: number; last: number; change: number; avg: number } | null = null
  if (selectedCategory) {
    const vals = series.map(r => r.totals[selectedCategory] || 0)
    const first = vals.find(v => v > 0) ?? 0
    const last = vals[vals.length - 1] ?? 0
    const change = first > 0 ? ((last - first) / first) * 100 : 0
    const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0
    stats = { first, last, change, avg }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kategori Dönem Trendi{selectedCategory ? ` — ${selectedCategory}` : ''}</CardTitle>
        {selectedCategory
          ? <p className="text-xs text-muted-foreground">Seçili kategori kalın çizgi. Soldaki grafikten başka kategoriye tıklayarak değiştir.</p>
          : <p className="text-xs text-muted-foreground">En çok harcanan kategorilerin maaş dönemi bazında değişimi. Soldaki grafikten bir kategori seçince o çizgi vurgulanır.</p>}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={data} margin={{ left: 10, right: 20, top: 10 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="period" fontSize={12} />
            <YAxis tickFormatter={(v) => `€${v}`} fontSize={11} width={60} />
            <Tooltip formatter={(value, name) => [formatCurrency(Number(value)), name as string]} />
            <Legend />
            {cats.map(c => {
              const isSel = selectedCategory === c
              const dim = selectedCategory !== null && !isSel
              return (
                <Line
                  key={c}
                  type="monotone"
                  dataKey={c}
                  name={c}
                  stroke={colorOf(c)}
                  strokeWidth={isSel ? 3 : dim ? 1 : 2}
                  strokeOpacity={dim ? 0.3 : 1}
                  dot={isSel}
                />
              )
            })}
          </LineChart>
        </ResponsiveContainer>
        {stats && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div><div className="text-xs text-muted-foreground">İlk dönem</div><div className="font-medium">{formatCurrency(stats.first)}</div></div>
            <div><div className="text-xs text-muted-foreground">Son dönem</div><div className="font-medium">{formatCurrency(stats.last)}</div></div>
            <div>
              <div className="text-xs text-muted-foreground">Değişim</div>
              <div className={`font-medium ${stats.change > 0 ? 'text-red-600' : stats.change < 0 ? 'text-green-600' : ''}`}>
                {stats.change > 0 ? '+' : ''}{stats.change.toFixed(0)}%
              </div>
            </div>
            <div><div className="text-xs text-muted-foreground">Dönem ort.</div><div className="font-medium">{formatCurrency(stats.avg)}</div></div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
