'use client'

import { OverviewCards } from '@/components/dashboard/overview-cards'
import { SpendingChart } from '@/components/dashboard/spending-chart'
import { RecentTransactions } from '@/components/dashboard/recent-transactions'
import { BudgetComparison } from '@/components/dashboard/budget-comparison'
import { UpcomingItems } from '@/components/dashboard/upcoming-items'
import { useBudgetStore } from '@/lib/stores/budget-store'
import { useSettingsStore } from '@/lib/stores/settings-store'
import { Upload, FlaskConical, Loader2, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils/currency'
import Link from 'next/link'
import { useState } from 'react'
import { toast } from 'sonner'

export default function DashboardPage() {
  const { isLoaded, setBudgetData, getPayPeriods, getTotalIncome, getTotalExpense } = useBudgetStore()
  const { selectedPayPeriodIndex, setSelectedPayPeriodIndex } = useSettingsStore()
  const [loading, setLoading] = useState(false)

  async function loadTestData() {
    setLoading(true)
    try {
      const res = await fetch('/api/load-test-data')
      if (!res.ok) throw new Error('Sunucu hatası')
      const data = await res.json()
      setBudgetData(data)
      toast.success(`${data.transactions.length} işlem yüklendi (son 3 ay)`)
    } catch {
      toast.error('Test verisi yüklenemedi')
    } finally {
      setLoading(false)
    }
  }

  if (!isLoaded) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <Upload className="h-16 w-16 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">Hoş Geldiniz!</h2>
        <p className="text-muted-foreground mb-4 max-w-md">
          Bütçe analizine başlamak için Excel dosyanızı yükleyin ya da test verisiyle deneyin.
        </p>
        <div className="flex gap-3">
          <Link href="/ekstreler/yukle">
            <Button size="lg">
              <Upload className="h-4 w-4 mr-2" />
              Excel Yükle
            </Button>
          </Link>
          <Button size="lg" variant="outline" onClick={loadTestData} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FlaskConical className="h-4 w-4 mr-2" />}
            Test Verisi Yükle
          </Button>
        </div>
      </div>
    )
  }

  const periods = getPayPeriods()
  const activePeriod = selectedPayPeriodIndex !== null
    ? periods.find(p => p.index === selectedPayPeriodIndex) ?? null
    : null

  const income = activePeriod ? getTotalIncome(activePeriod) : null
  const expense = activePeriod ? getTotalExpense(activePeriod) : null
  const remaining = income !== null && expense !== null ? income - expense : null
  const spentPct = income && income > 0 ? Math.min((expense! / income) * 100, 100) : 0
  const savingsTargetPct = 20                                          // %20 kuralı
  const spendingLimitPct = 100 - savingsTargetPct                      // %80 harcama sınırı
  const savingsTarget = income ? income * (savingsTargetPct / 100) : 0
  const overBudget = spentPct > spendingLimitPct

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Genel Bakış</h1>
        <div className="flex items-center gap-2">
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
          <Button variant="outline" size="sm" onClick={loadTestData} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FlaskConical className="h-4 w-4 mr-2" />}
            Yenile
          </Button>
        </div>
      </div>

      {/* Active period banner */}
      {activePeriod && income !== null && expense !== null && remaining !== null && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{activePeriod.shortLabel}</p>
                <p className="text-xs text-muted-foreground">{activePeriod.label}</p>
              </div>
              <div className="flex gap-6 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Maaş Geliri</p>
                  <p className="font-semibold text-green-600">{formatCurrency(income)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Harcama</p>
                  <p className="font-semibold text-red-600">{formatCurrency(expense)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Kalan</p>
                  <p className={`font-semibold ${remaining >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(remaining)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Öngörülen Birikim</p>
                  <p className="font-semibold text-blue-600">{formatCurrency(savingsTarget)}</p>
                </div>
              </div>
            </div>

            {/* Segmentli bar: kırmızı=harcama, mavi=%20 tasarruf hedefi */}
            <div className="mt-3">
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-muted-foreground">
                  Harcama <span className={overBudget ? 'text-red-600 font-medium' : ''}>%{spentPct.toFixed(1)}</span>
                </span>
                <span className="text-blue-600 font-medium">
                  Tasarruf hedefi %{savingsTargetPct} = {formatCurrency(savingsTarget)}
                </span>
              </div>
              <div className="relative h-3 rounded-full bg-gray-100 overflow-hidden">
                {/* Mavi tasarruf hedefi bölgesi (sağdaki %20) */}
                <div
                  className="absolute right-0 top-0 h-full bg-blue-200"
                  style={{ width: `${savingsTargetPct}%` }}
                />
                {/* Kırmızı harcama barı */}
                <div
                  className={`absolute left-0 top-0 h-full rounded-l-full transition-all duration-500 ${overBudget ? 'bg-red-500' : 'bg-red-400'}`}
                  style={{ width: `${spentPct}%` }}
                />
                {/* %80 sınır çizgisi */}
                <div
                  className="absolute top-0 h-full w-0.5 bg-blue-500 z-10"
                  style={{ left: `${spendingLimitPct}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>0</span>
                <span className="text-blue-500" style={{ marginLeft: `${spendingLimitPct - 4}%` }}>←%{spendingLimitPct}</span>
                <span>{formatCurrency(income)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <OverviewCards />
      <UpcomingItems />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SpendingChart />
        <RecentTransactions />
      </div>
      <BudgetComparison />
    </div>
  )
}
