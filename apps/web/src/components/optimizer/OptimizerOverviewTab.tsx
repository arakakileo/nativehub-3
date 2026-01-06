import { motion } from 'framer-motion'
import { Clock, CheckCircle, XCircle, AlertCircle, Activity } from 'lucide-react'
import { DataTable } from '../ui/DataTable'
import { StatusBadge } from '../ui/StatusBadge'
import { useOptimizerStatus, useOptimizerActions } from '../../hooks/useOptimizer'
import { formatDistanceToNow } from 'date-fns'
import type { OptimizerAction } from '../../lib/api'

export function OptimizerOverviewTab() {
  const { data: status } = useOptimizerStatus()
  const { data: actions = [], isLoading: actionsLoading } = useOptimizerActions()

  const recentActions = actions.slice(0, 10)

  const actionColumns = [
    {
      key: 'actionType',
      header: 'Action',
      render: (a: OptimizerAction) => (
        <span className="font-medium capitalize">{a.actionType.replace('_', ' ')}</span>
      ),
    },
    {
      key: 'targetName',
      header: 'Target',
      render: (a: OptimizerAction) => a.targetName || a.targetId,
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (a: OptimizerAction) => (
        <span className="text-sm text-muted-foreground">{a.reason}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (a: OptimizerAction) => (
        <StatusBadge status={a.executed ? 'active' : a.error ? 'error' : 'pending'} />
      ),
    },
    {
      key: 'createdAt',
      header: 'When',
      render: (a: OptimizerAction) => (
        <span className="text-sm text-muted-foreground">
          {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      {/* Status Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Scheduler Status */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border bg-card p-6"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className={`p-2 rounded-lg ${status?.scheduler?.active ? 'bg-green-100 dark:bg-green-900' : 'bg-gray-100 dark:bg-gray-800'}`}>
              <Clock className={`h-5 w-5 ${status?.scheduler?.active ? 'text-green-600' : 'text-gray-500'}`} />
            </div>
            <div>
              <h3 className="font-semibold">Scheduler</h3>
              <p className="text-sm text-muted-foreground">
                {status?.scheduler?.active ? 'Active' : 'Inactive'}
              </p>
            </div>
          </div>
          {status?.scheduler?.cron && (
            <p className="text-sm">
              <span className="text-muted-foreground">Schedule:</span>{' '}
              <code className="px-1.5 py-0.5 rounded bg-muted text-xs">
                {status.scheduler.cron}
              </code>
            </p>
          )}
        </motion.div>

        {/* Queue Status */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-xl border bg-card p-6"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900">
              <Activity className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold">Job Queue</h3>
              <p className="text-sm text-muted-foreground">
                {status?.queue?.active ?? 0} active, {status?.queue?.pending ?? 0} pending
              </p>
            </div>
          </div>
          <div className="flex gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Active:</span>{' '}
              <span className="font-medium">{status?.queue?.active ?? 0}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Pending:</span>{' '}
              <span className="font-medium">{status?.queue?.pending ?? 0}</span>
            </div>
          </div>
        </motion.div>

        {/* Overall Status */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-xl border bg-card p-6"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className={`p-2 rounded-lg ${
              status?.status === 'ok'
                ? 'bg-green-100 dark:bg-green-900'
                : 'bg-red-100 dark:bg-red-900'
            }`}>
              {status?.status === 'ok' ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600" />
              )}
            </div>
            <div>
              <h3 className="font-semibold">System Status</h3>
              <p className="text-sm text-muted-foreground capitalize">
                {status?.status ?? 'Unknown'}
              </p>
            </div>
          </div>
          {status?.error && (
            <div className="flex items-start gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm">
              <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
              <span className="text-red-700 dark:text-red-400">{status.error}</span>
            </div>
          )}
        </motion.div>
      </div>

      {/* Recent Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <h2 className="mb-4 text-lg font-semibold">Recent Actions</h2>
        <DataTable
          data={recentActions}
          columns={actionColumns}
          keyField="id"
          isLoading={actionsLoading}
          emptyMessage="No recent optimizer actions. Run the optimizer to generate actions."
        />
      </motion.div>
    </div>
  )
}
