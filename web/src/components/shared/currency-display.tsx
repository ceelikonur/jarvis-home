import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/utils/currency'

interface CurrencyDisplayProps {
  amount: number
  className?: string
  colorize?: boolean
}

export function CurrencyDisplay({ amount, className, colorize = false }: CurrencyDisplayProps) {
  return (
    <span
      className={cn(
        'font-medium tabular-nums',
        colorize && amount > 0 && 'text-green-600',
        colorize && amount < 0 && 'text-red-600',
        className
      )}
    >
      {formatCurrency(amount)}
    </span>
  )
}
