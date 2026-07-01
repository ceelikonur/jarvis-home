import { getHousehold } from '@/lib/config/household-config'

export function formatCurrency(amount: number): string {
  const { locale, currency } = getHousehold()
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount)
}

export function parseCurrencyString(str: string): number {
  const cleaned = str
    .replace(/[€EUR\s]/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
  return parseFloat(cleaned)
}
