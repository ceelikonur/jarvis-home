import type { Transaction } from '@/lib/types/budget'
import { getHousehold } from '@/lib/config/household-config'

export interface PayPeriod {
  index: number        // 1-based
  label: string        // "26 Oca 2026 – 23 Şub 2026"
  shortLabel: string   // "Dönem 1"
  startDate: Date
  endDate: Date        // day before next salary, or today if active
  isActive: boolean
}

const SHORT_MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']

function fmt(d: Date): string {
  return `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export function isSalaryTx(tx: Transaction): boolean {
  if (tx.type !== 'income') return false
  const text = `${tx.source} ${tx.subCategory}`.toUpperCase()
  return getHousehold().salaryKeywords.some(k => text.includes(k.toUpperCase()))
}

export function detectPayPeriods(transactions: Transaction[]): PayPeriod[] {
  const salaryTxs = transactions
    .filter(isSalaryTx)
    .map(t => ({ ...t, date: new Date(t.date) }))
    .sort((a, b) => a.date.getTime() - b.date.getTime())

  if (salaryTxs.length === 0) return []

  // Group salary events: two salaries within 7 days = same pay cycle
  const cycleStarts: Date[] = []
  let lastDate: Date | null = null

  for (const tx of salaryTxs) {
    if (!lastDate || tx.date.getTime() - lastDate.getTime() > 7 * 86400000) {
      cycleStarts.push(tx.date)
    }
    lastDate = tx.date
  }

  const today = new Date()
  const periods: PayPeriod[] = []

  for (let i = 0; i < cycleStarts.length; i++) {
    const startDate = cycleStarts[i]
    const isActive = i === cycleStarts.length - 1
    // End date = day before next cycle starts, or today for the active period
    const endDate = isActive
      ? today
      : new Date(cycleStarts[i + 1].getTime() - 86400000)

    periods.push({
      index: i + 1,
      label: isActive ? `${fmt(startDate)} – devam ediyor` : `${fmt(startDate)} – ${fmt(endDate)}`,
      shortLabel: `Dönem ${i + 1}`,
      startDate,
      endDate,
      isActive,
    })
  }

  return periods
}

export function isInPeriod(date: Date, period: PayPeriod): boolean {
  const d = new Date(date)
  const start = new Date(period.startDate)
  const end = new Date(period.endDate)
  // Compare date-only (ignore time)
  start.setHours(0, 0, 0, 0)
  end.setHours(23, 59, 59, 999)
  return d >= start && d <= end
}
