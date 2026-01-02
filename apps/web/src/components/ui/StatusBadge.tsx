import { cn, getStatusColor } from '../../lib/utils'

interface StatusBadgeProps {
  status: string
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        className
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', getStatusColor(status))} />
      <span className="capitalize">{status}</span>
    </span>
  )
}
