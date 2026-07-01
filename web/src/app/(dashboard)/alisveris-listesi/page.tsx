'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useBudgetStore } from '@/lib/stores/budget-store'
import { formatCurrency } from '@/lib/utils/currency'
import { CheckCircle2, Circle, ShoppingBag } from 'lucide-react'

export default function WishlistPage() {
  const { wishlist, isLoaded } = useBudgetStore()

  if (!isLoaded || wishlist.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Alışveriş Listesi</h1>
        <Card className="text-center py-12">
          <CardContent>
            <ShoppingBag className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Excel yükledikten sonra alışveriş listesi görünecek</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const totalPrice = wishlist.filter(w => w.price && !w.checked).reduce((s, w) => s + (w.price || 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Alışveriş Listesi</h1>
        <span className="text-sm text-muted-foreground">Tahmini toplam: {formatCurrency(totalPrice)}</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {wishlist.map((item, i) => (
          <Card key={i} className={item.checked ? 'opacity-60' : ''}>
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              {item.checked
                ? <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                : <Circle className="h-5 w-5 text-muted-foreground shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className={`font-medium ${item.checked ? 'line-through' : ''}`}>{item.product}</p>
                {item.status && <p className="text-xs text-muted-foreground">{item.status}</p>}
              </div>
              {item.price && (
                <Badge variant="secondary">{formatCurrency(item.price)}</Badge>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
