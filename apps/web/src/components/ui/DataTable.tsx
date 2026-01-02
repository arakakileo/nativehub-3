import { motion } from 'framer-motion'
import { cn } from '../../lib/utils'

interface Column<T> {
  key: keyof T | string
  header: string
  render?: (item: T) => React.ReactNode
  className?: string
}

interface DataTableProps<T> {
  data: T[]
  columns: Column<T>[]
  keyField: keyof T
  isLoading?: boolean
  emptyMessage?: string
  onRowClick?: (item: T) => void
}

export function DataTable<T>({
  data,
  columns,
  keyField,
  isLoading,
  emptyMessage = 'No data available',
  onRowClick,
}: DataTableProps<T>) {
  if (isLoading) {
    return (
      <div className="rounded-xl border bg-card">
        <div className="animate-pulse p-6">
          <div className="h-8 bg-muted rounded mb-4" />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-muted/50 rounded mb-2" />
          ))}
        </div>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-12 text-center">
        <p className="text-muted-foreground">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              {columns.map((col) => (
                <th
                  key={String(col.key)}
                  className={cn(
                    'px-6 py-3 text-left text-sm font-medium text-muted-foreground',
                    col.className
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((item, index) => (
              <motion.tr
                key={String(item[keyField])}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.02 }}
                onClick={() => onRowClick?.(item)}
                className={cn(
                  'border-b last:border-0 transition-colors',
                  onRowClick && 'cursor-pointer hover:bg-muted/50'
                )}
              >
                {columns.map((col) => (
                  <td
                    key={String(col.key)}
                    className={cn('px-6 py-4 text-sm', col.className)}
                  >
                    {col.render
                      ? col.render(item)
                      : String(item[col.key as keyof T] ?? '')}
                  </td>
                ))}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
