import { motion } from 'framer-motion'
import {
  AlertTriangle,
  AlertCircle,
  Info,
  Bell,
  TrendingUp,
  TrendingDown,
  DollarSign,
  MousePointer,
} from 'lucide-react'
import { Button } from '../ui/Button'
import { DataTable } from '../ui/DataTable'
import { useAnomalies, useSendAnomalyAlerts } from '../../hooks/useAdvancedOptimizer'
import { formatDistanceToNow } from 'date-fns'
import { formatNumber, formatPercent } from '../../lib/utils'
import type { Anomaly } from '../../lib/api'

const severityConfig = {
  critical: {
    icon: AlertTriangle,
    color: 'text-red-600',
    bg: 'bg-red-50 dark:bg-red-900/20',
    border: 'border-red-200 dark:border-red-800',
  },
  warning: {
    icon: AlertCircle,
    color: 'text-yellow-600',
    bg: 'bg-yellow-50 dark:bg-yellow-900/20',
    border: 'border-yellow-200 dark:border-yellow-800',
  },
  info: {
    icon: Info,
    color: 'text-blue-600',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    border: 'border-blue-200 dark:border-blue-800',
  },
}

const typeIcons = {
  spend_spike: DollarSign,
  conversion_drop: TrendingDown,
  ctr_anomaly: MousePointer,
  cpa_spike: TrendingUp,
}

export function AnomaliesTab() {
  const { data: anomaliesData, isLoading, refetch } = useAnomalies()
  const sendAlerts = useSendAnomalyAlerts()

  const anomalies = anomaliesData?.anomalies ?? []
  const summary = anomaliesData?.summary

  const columns = [
    {
      key: 'severity',
      header: 'Severity',
      render: (a: Anomaly) => {
        const config = severityConfig[a.severity]
        const Icon = config.icon
        return (
          <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full ${config.bg} ${config.color}`}>
            <Icon className="h-3.5 w-3.5" />
            <span className="text-xs font-medium capitalize">{a.severity}</span>
          </div>
        )
      },
    },
    {
      key: 'type',
      header: 'Type',
      render: (a: Anomaly) => {
        const Icon = typeIcons[a.type] || AlertCircle
        return (
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <span className="capitalize">{a.type.replace(/_/g, ' ')}</span>
          </div>
        )
      },
    },
    {
      key: 'campaignName',
      header: 'Campaign',
      render: (a: Anomaly) => (
        <span className="font-medium">{a.campaignName}</span>
      ),
    },
    {
      key: 'deviation',
      header: 'Deviation',
      render: (a: Anomaly) => (
        <div className="flex items-center gap-2">
          {a.deviation > 0 ? (
            <TrendingUp className="h-4 w-4 text-red-500" />
          ) : (
            <TrendingDown className="h-4 w-4 text-red-500" />
          )}
          <span className="font-medium">
            {a.deviation > 0 ? '+' : ''}{formatPercent(a.deviation)}
          </span>
        </div>
      ),
      className: 'text-right',
    },
    {
      key: 'values',
      header: 'Current / Expected',
      render: (a: Anomaly) => (
        <div className="text-sm">
          <span className="font-medium">{formatNumber(a.currentValue)}</span>
          <span className="text-muted-foreground"> / {formatNumber(a.expectedValue)}</span>
        </div>
      ),
      className: 'text-right',
    },
    {
      key: 'message',
      header: 'Details',
      render: (a: Anomaly) => (
        <span className="text-sm text-muted-foreground">{a.message}</span>
      ),
    },
    {
      key: 'detectedAt',
      header: 'Detected',
      render: (a: Anomaly) => (
        <span className="text-sm text-muted-foreground">
          {formatDistanceToNow(new Date(a.detectedAt), { addSuffix: true })}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        {(['critical', 'warning', 'info'] as const).map((severity, index) => {
          const config = severityConfig[severity]
          const Icon = config.icon
          const count = summary?.[severity] ?? 0

          return (
            <motion.div
              key={severity}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`rounded-xl border ${config.border} ${config.bg} p-6`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`h-8 w-8 ${config.color}`} />
                <div>
                  <p className="text-sm text-muted-foreground capitalize">{severity}</p>
                  <p className="text-3xl font-bold">{count}</p>
                </div>
              </div>
            </motion.div>
          )
        })}

        {/* Send Alerts Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-xl border bg-card p-6 flex flex-col justify-center"
        >
          <Button
            onClick={() => {
              // Send alerts for all accounts with anomalies
              const accountIds = [...new Set(anomalies.map(a => a.sourceAccountId).filter(Boolean))]
              accountIds.forEach(id => {
                if (id) sendAlerts.mutate(id)
              })
            }}
            disabled={sendAlerts.isPending || (summary?.critical ?? 0) === 0}
            isLoading={sendAlerts.isPending}
            variant="outline"
            className="w-full"
          >
            <Bell className="h-4 w-4" />
            Send Alerts
          </Button>
          <p className="text-xs text-muted-foreground text-center mt-2">
            Notify about critical anomalies
          </p>
        </motion.div>
      </div>

      {/* Anomalies Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            Detected Anomalies
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({summary?.total ?? 0} total)
            </span>
          </h2>
          <Button onClick={() => refetch()} variant="outline" size="sm">
            Refresh
          </Button>
        </div>
        <DataTable
          data={anomalies}
          columns={columns}
          keyField="id"
          isLoading={isLoading}
          emptyMessage="No anomalies detected. Your campaigns are performing normally."
        />
      </motion.div>
    </div>
  )
}
