'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useBudgetStore } from '@/lib/stores/budget-store'
import { formatCurrency } from '@/lib/utils/currency'
import { ArrowRight } from 'lucide-react'

export function RecentTransactions() {
  const { transactions } = useBudgetStore()
  const recent = [...transactions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 10)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Son İşlemler</CardTitle>
        <Link href="/islemler" className="text-xs text-primary hover:underline flex items-center gap-1">
          Tümünü gör <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {recent.length === 0 && <p className="text-muted-foreground text-sm">Henüz işlem yok</p>}
          {recent.map((tx, i) => {
            const date = new Date(tx.date)
            const dateStr = isNaN(date.getTime()) ? '-' : date.toLocaleDateString('tr-TR')
            return (
              <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{tx.source || '—'}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs text-muted-foreground">{dateStr}</span>
                    <Link href={`/islemler?sub=${encodeURIComponent(tx.subCategory)}`}>
                      <Badge variant="secondary" className="text-xs cursor-pointer hover:bg-secondary/80">{tx.subCategory || tx.category || '—'}</Badge>
                    </Link>
                    {tx.person && <Badge variant="outline" className="text-xs">{tx.person}</Badge>}
                  </div>
                </div>
                <span className={`text-sm font-medium ml-4 whitespace-nowrap ${tx.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                  {tx.type === 'income' ? '+' : ''}{formatCurrency(tx.amount)}
                </span>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
