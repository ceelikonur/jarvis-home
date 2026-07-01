'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils/currency'
import { useBudgetStore } from '@/lib/stores/budget-store'
import { useSettingsStore } from '@/lib/stores/settings-store'
import { TrendingUp, TrendingDown, Wallet, PiggyBank, Landmark, ArrowRight } from 'lucide-react'

export function OverviewCards() {
  const { selectedPeriod, selectedPayPeriodIndex } = useSettingsStore()
  const { getTotalIncome, getTotalExpense, getTotalSavings, getMonthBudget, getMonths, getPayPeriods } = useBudgetStore()

  const months = getMonths()
  const currentMonth = months[selectedPeriod.month - 1] || months[0] || ''

  // Filter semantics:
  //   selectedPayPeriodIndex = number  → filter by that pay period
  //   selectedPayPeriodIndex = null    → truly all (ignore topbar month)
  const periods = getPayPeriods()
  const activePeriod = selectedPayPeriodIndex !== null
    ? periods.find(p => p.index === selectedPayPeriodIndex) ?? undefined
    : undefined
  const showAll = selectedPayPeriodIndex === null

  const filter = showAll ? undefined : activePeriod

  const income = getTotalIncome(filter)
  const expense = getTotalExpense(filter)
  const savings = getTotalSavings(filter)
  const net = income - expense
  const savingsRate = income > 0 ? ((net / income) * 100) : 0
  const budget = getMonthBudget(currentMonth)

  const monthParam = showAll ? '' : (currentMonth ? `&month=${currentMonth}` : '')
  const periodLabel = showAll ? 'Tüm işlemler' : (activePeriod ? activePeriod.shortLabel : currentMonth)

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      <Link href={`/islemler?type=income${monthParam}`}>
        <Card className="cursor-pointer hover:shadow-md transition-shadow group">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Toplam Gelir</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(income)}</div>
            <div className="flex items-center justify-between mt-1">
              {periodLabel && <p className="text-xs text-muted-foreground">{periodLabel}</p>}
              <ArrowRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </CardContent>
        </Card>
      </Link>

      <Link href={`/islemler?type=expense${monthParam}`}>
        <Card className="cursor-pointer hover:shadow-md transition-shadow group">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Toplam Gider</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatCurrency(expense)}</div>
            <div className="flex items-center justify-between mt-1">
              {showAll
                ? <p className="text-xs text-muted-foreground">{periodLabel}</p>
                : (budget ? <p className="text-xs text-muted-foreground">Öngörülen: {formatCurrency(Math.abs(budget.totalProjected))}</p> : <span />)}
              <ArrowRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </CardContent>
        </Card>
      </Link>

      <Link href={`/islemler?${monthParam.replace('&', '')}`}>
        <Card className="cursor-pointer hover:shadow-md transition-shadow group">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Net Durum</CardTitle>
            <Wallet className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(net)}
            </div>
            <div className="flex items-center justify-between mt-1">
              <span />
              <ArrowRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </CardContent>
        </Card>
      </Link>

      <Link href={`/islemler?sub=BİRİKİM`}>
        <Card className="cursor-pointer hover:shadow-md transition-shadow group border-sky-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Gerçekleşen Birikim</CardTitle>
            <Landmark className="h-4 w-4 text-sky-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-sky-600">{formatCurrency(savings)}</div>
            <div className="flex items-center justify-between mt-1">
              <p className="text-xs text-muted-foreground">Birikim hesabı</p>
              <ArrowRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </CardContent>
        </Card>
      </Link>

      <Link href="/analiz">
        <Card className="cursor-pointer hover:shadow-md transition-shadow group">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tasarruf Oranı</CardTitle>
            <PiggyBank className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${savingsRate >= 20 ? 'text-green-600' : savingsRate >= 10 ? 'text-yellow-600' : 'text-red-600'}`}>
              %{savingsRate.toFixed(1)}
            </div>
            <div className="flex items-center justify-between mt-1">
              {showAll
                ? <p className="text-xs text-muted-foreground">{periodLabel}</p>
                : (budget ? <p className="text-xs text-muted-foreground">Hedef: {formatCurrency(budget.savingsTarget)}</p> : <span />)}
              <ArrowRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  )
}
