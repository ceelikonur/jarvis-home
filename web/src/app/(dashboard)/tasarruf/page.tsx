'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useBudgetStore } from '@/lib/stores/budget-store'
import { useSettingsStore } from '@/lib/stores/settings-store'
import { useCategoriesStore } from '@/lib/stores/categories-store'
import { formatCurrency } from '@/lib/utils/currency'
import { isInPeriod } from '@/lib/utils/periods'
import { TrendingUp, TrendingDown, PiggyBank, AlertTriangle, ChevronDown } from 'lucide-react'

export default function SavingsPage() {
  const { isLoaded, transactions, getPayPeriods } = useBudgetStore()
  const { selectedPayPeriodIndex, selectedPeriod, setSelectedPayPeriodIndex } = useSettingsStore()
  const { categories } = useCategoriesStore()

  const periods = getPayPeriods()
  const months = Array.from(new Set(transactions.map(t => t.month)))

  // Aktif dönem
  const activePeriod = selectedPayPeriodIndex !== null
    ? periods.find(p => p.index === selectedPayPeriodIndex) ?? undefined
    : undefined

  // Ay adı filtresi (dönem seçili değilse)
  const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
  const currentMonthName = monthNames[selectedPeriod.month - 1] || months[0] || ''

  // Filtreli işlemler
  const filteredTxs = useMemo(() => {
    if (activePeriod) {
      return transactions.filter(t => isInPeriod(new Date(t.date), activePeriod))
    }
    return transactions.filter(t => !currentMonthName || t.month === currentMonthName)
  }, [transactions, activePeriod, currentMonthName])

  // Gelir toplamı
  const income = filteredTxs
    .filter(t => t.type === 'income')
    .reduce((s, t) => s + t.amount, 0)

  // Kategoriye göre gider toplamları
  const categoryTotals = useMemo(() => {
    const map = new Map<string, number>()
    filteredTxs.filter(t => t.type === 'expense').forEach(t => {
      const cat = t.category || 'Kategorisiz'
      map.set(cat, (map.get(cat) || 0) + Math.abs(t.amount))
    })
    return map
  }, [filteredTxs])

  // Sabit ve değişken kategoriler
  const fixedCategories = categories.filter(c => c.is_fixed)
  const variableCategories = categories.filter(c => !c.is_fixed && c.name !== 'Gelir')

  const fixedTotal = fixedCategories.reduce((s, c) => s + (categoryTotals.get(c.name) || 0), 0)
  const variableTotal = variableCategories.reduce((s, c) => s + (categoryTotals.get(c.name) || 0), 0)
  const uncategorizedTotal = categoryTotals.get('Kategorisiz') || 0
  const totalExpense = fixedTotal + variableTotal + uncategorizedTotal
  const savings = income - totalExpense
  const savingsRate = income > 0 ? (savings / income) * 100 : 0
  const targetRate = 20 // %20 kuralı
  const targetSavings = income * (targetRate / 100)

  // Dönem etiketi
  const periodLabel = activePeriod
    ? activePeriod.shortLabel
    : currentMonthName

  if (!isLoaded) {
    return <div className="text-muted-foreground p-6">Önce veri yükleyin.</div>
  }

  return (
    <div className="space-y-6">
      {/* Başlık ve dönem seçici */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Tasarruf Analizi</h1>
        {periods.length > 0 && (
          <Select
            value={selectedPayPeriodIndex !== null ? String(selectedPayPeriodIndex) : 'all'}
            onValueChange={(v) => setSelectedPayPeriodIndex(v === 'all' ? null : Number(v))}
          >
            <SelectTrigger className="w-[220px]">
              <ChevronDown className="h-4 w-4 mr-1 text-muted-foreground" />
              <SelectValue placeholder="Dönem seç" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm işlemler</SelectItem>
              {periods.map(p => (
                <SelectItem key={p.index} value={String(p.index)}>
                  {p.shortLabel}{p.isActive ? ' (aktif)' : ''} — {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Özet kartlar — waterfall görünümü */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Gelir */}
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-green-600" />
              <span className="text-xs text-green-700 font-medium">Maaş Geliri</span>
            </div>
            <p className="text-2xl font-bold text-green-700">{formatCurrency(income)}</p>
            <p className="text-xs text-muted-foreground mt-1">{periodLabel}</p>
          </CardContent>
        </Card>

        {/* Sabit giderler */}
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <span className="text-xs text-red-700 font-medium">Sabit Giderler</span>
            </div>
            <p className="text-2xl font-bold text-red-700">{formatCurrency(fixedTotal)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {income > 0 ? `%${((fixedTotal / income) * 100).toFixed(0)} gelirin` : '—'}
            </p>
          </CardContent>
        </Card>

        {/* Değişken giderler */}
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="h-4 w-4 text-orange-600" />
              <span className="text-xs text-orange-700 font-medium">Değişken Giderler</span>
            </div>
            <p className="text-2xl font-bold text-orange-700">{formatCurrency(variableTotal + uncategorizedTotal)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {income > 0 ? `%${(((variableTotal + uncategorizedTotal) / income) * 100).toFixed(0)} gelirin` : '—'}
            </p>
          </CardContent>
        </Card>

        {/* Net birikim */}
        <Card className={`border ${savings >= 0 ? 'border-blue-200 bg-blue-50' : 'border-red-200 bg-red-50'}`}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <PiggyBank className={`h-4 w-4 ${savings >= 0 ? 'text-blue-600' : 'text-red-600'}`} />
              <span className={`text-xs font-medium ${savings >= 0 ? 'text-blue-700' : 'text-red-700'}`}>Net Birikim</span>
            </div>
            <p className={`text-2xl font-bold ${savings >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
              {formatCurrency(savings)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              %{Math.abs(savingsRate).toFixed(1)} {savings >= 0 ? 'birikim' : 'açık'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tasarruf hedefi — %20 kuralı */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tasarruf Hedefi (%20 Kuralı)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between text-sm">
            <span>Gerçekleşen birikim</span>
            <span className={savings >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
              {formatCurrency(savings)}
            </span>
          </div>
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Hedef (%{targetRate})</span>
            <span>{formatCurrency(targetSavings)}</span>
          </div>
          <Progress
            value={Math.max(0, Math.min((targetSavings > 0 ? (savings / targetSavings) * 100 : 0), 100))}
            className="h-3"
          />
          <p className="text-xs text-muted-foreground">
            {savings >= targetSavings
              ? `Tebrikler! Hedefi ${formatCurrency(savings - targetSavings)} aştınız.`
              : savings >= 0
              ? `Hedefe ulaşmak için ${formatCurrency(targetSavings - savings)} daha biriktirmeniz gerekiyor.`
              : `Bu dönemde ${formatCurrency(Math.abs(savings))} bütçe açığı var.`}
          </p>
        </CardContent>
      </Card>

      {/* Sabit ve değişken gider detayı */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Sabit giderler detayı */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Sabit Giderler</CardTitle>
              <Badge variant="destructive">{formatCurrency(fixedTotal)}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {fixedCategories.map(cat => {
              const amount = categoryTotals.get(cat.name) || 0
              if (amount === 0) return null
              const pct = income > 0 ? (amount / income) * 100 : 0
              return (
                <div key={cat.name}>
                  <div className="flex justify-between text-sm mb-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
                      <span>{cat.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-medium">{formatCurrency(amount)}</span>
                      <span className="text-xs text-muted-foreground ml-2">%{pct.toFixed(0)}</span>
                    </div>
                  </div>
                  <Progress value={Math.min(pct * 2, 100)} className="h-1.5" />
                </div>
              )
            })}
            {fixedTotal === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Bu dönem için sabit gider kategorize edilmemiş. İşlemler tabından kategorileri güncelleyin.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Değişken giderler detayı */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Değişken Giderler</CardTitle>
              <Badge variant="outline">{formatCurrency(variableTotal + uncategorizedTotal)}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {variableCategories.map(cat => {
              const amount = categoryTotals.get(cat.name) || 0
              if (amount === 0) return null
              const pct = income > 0 ? (amount / income) * 100 : 0
              return (
                <div key={cat.name}>
                  <div className="flex justify-between text-sm mb-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
                      <span>{cat.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-medium">{formatCurrency(amount)}</span>
                      <span className="text-xs text-muted-foreground ml-2">%{pct.toFixed(0)}</span>
                    </div>
                  </div>
                  <Progress value={Math.min(pct * 2, 100)} className="h-1.5" />
                </div>
              )
            })}

            {/* Kategorisiz giderler */}
            {uncategorizedTotal > 0 && (
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-gray-400" />
                    <span className="text-muted-foreground">Kategorisiz</span>
                  </div>
                  <div className="text-right">
                    <span className="font-medium text-muted-foreground">{formatCurrency(uncategorizedTotal)}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      %{income > 0 ? ((uncategorizedTotal / income) * 100).toFixed(0) : 0}
                    </span>
                  </div>
                </div>
                <Progress
                  value={Math.min(income > 0 ? (uncategorizedTotal / income) * 200 : 0, 100)}
                  className="h-1.5"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  İşlemler tabından kategorize edin
                </p>
              </div>
            )}

            {variableTotal === 0 && uncategorizedTotal === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Bu dönem için değişken gider yok.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
