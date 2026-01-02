import { motion } from 'framer-motion'
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react'
import { cn, formatCurrency, formatNumber, formatPercent } from '../../lib/utils'

interface MetricCardProps {
  title: string
  value: number
  previousValue?: number
  format?: 'currency' | 'number' | 'percent'
  icon: LucideIcon
  iconColor?: string
}

export function MetricCard({
  title,
  value,
  previousValue,
  format = 'number',
  icon: Icon,
  iconColor = 'text-primary',
}: MetricCardProps) {
  const formatValue = (v: number) => {
    switch (format) {
      case 'currency':
        return formatCurrency(v)
      case 'percent':
        return formatPercent(v)
      default:
        return formatNumber(v)
    }
  }

  const change = previousValue ? ((value - previousValue) / previousValue) * 100 : null
  const isPositive = change !== null && change >= 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border bg-card p-6 shadow-sm"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="mt-2 text-3xl font-bold">{formatValue(value)}</p>

          {change !== null && (
            <div
              className={cn(
                'mt-2 flex items-center gap-1 text-sm',
                isPositive ? 'text-green-600' : 'text-red-600'
              )}
            >
              {isPositive ? (
                <TrendingUp className="h-4 w-4" />
              ) : (
                <TrendingDown className="h-4 w-4" />
              )}
              <span>{Math.abs(change).toFixed(1)}%</span>
              <span className="text-muted-foreground">vs prev</span>
            </div>
          )}
        </div>

        <div className={cn('rounded-lg bg-primary/10 p-3', iconColor)}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </motion.div>
  )
}
