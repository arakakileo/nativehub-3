import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap, Plus, Trash2, X, Clock, CheckCircle, AlertCircle } from 'lucide-react'
import { DataTable } from '../components/ui/DataTable'
import { StatusBadge } from '../components/ui/StatusBadge'
import { Button } from '../components/ui/Button'
import {
  useOptimizerRules,
  useCreateOptimizerRule,
  useDeleteOptimizerRule,
  useOptimizerActions,
  useRunOptimizer,
} from '../hooks/useOptimizer'
import type { OptimizerRule, OptimizerAction } from '../lib/api'

const RULE_TEMPLATES = [
  { id: 'blacklist_no_conv', name: 'Blacklist No Conversions', description: 'Blacklist widgets with spend but no conversions' },
  { id: 'blacklist_high_cpa', name: 'Blacklist High CPA', description: 'Blacklist widgets with CPA above threshold' },
  { id: 'raise_bid_good_cpa', name: 'Raise Bid Good CPA', description: 'Increase bids for high-converting widgets' },
  { id: 'lower_bid_bad_cpa', name: 'Lower Bid Bad CPA', description: 'Decrease bids for underperforming widgets' },
  { id: 'pause_bleeding', name: 'Pause Bleeding Campaigns', description: 'Pause campaigns spending without results' },
]

export function Optimizer() {
  const [showModal, setShowModal] = useState(false)
  const [activeTab, setActiveTab] = useState<'rules' | 'actions'>('rules')

  const { data: rules = [], isLoading: rulesLoading } = useOptimizerRules()
  const { data: actions = [], isLoading: actionsLoading } = useOptimizerActions()
  const createMutation = useCreateOptimizerRule()
  const deleteMutation = useDeleteOptimizerRule()
  const runMutation = useRunOptimizer()

  const [form, setForm] = useState({
    templateId: '',
    name: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const template = RULE_TEMPLATES.find((t) => t.id === form.templateId)
    await createMutation.mutateAsync({
      name: form.name || template?.name || 'Custom Rule',
      templateId: form.templateId || undefined,
      conditions: {},
      actions: [],
      isActive: true,
    })
    setShowModal(false)
    setForm({ templateId: '', name: '' })
  }

  const rulesColumns = [
    { key: 'name', header: 'Rule Name' },
    {
      key: 'templateId',
      header: 'Template',
      render: (r: OptimizerRule) => (
        <span className="capitalize">{r.templateId?.replace(/_/g, ' ') || 'Custom'}</span>
      ),
    },
    {
      key: 'isActive',
      header: 'Status',
      render: (r: OptimizerRule) => (
        <StatusBadge status={r.isActive ? 'active' : 'paused'} />
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (r: OptimizerRule) => new Date(r.createdAt).toLocaleDateString(),
    },
    {
      key: 'actions',
      header: '',
      render: (r: OptimizerRule) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            if (confirm('Delete this rule?')) deleteMutation.mutate(r.id)
          }}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      ),
    },
  ]

  const actionsColumns = [
    {
      key: 'actionType',
      header: 'Action',
      render: (a: OptimizerAction) => (
        <span className="capitalize">{a.actionType.replace(/_/g, ' ')}</span>
      ),
    },
    { key: 'targetType', header: 'Target Type' },
    { key: 'targetId', header: 'Target ID' },
    {
      key: 'status',
      header: 'Status',
      render: (a: OptimizerAction) => {
        const icons: Record<string, React.ReactNode> = {
          pending: <Clock className="h-4 w-4 text-yellow-500" />,
          executed: <CheckCircle className="h-4 w-4 text-green-500" />,
          failed: <AlertCircle className="h-4 w-4 text-red-500" />,
        }
        return (
          <div className="flex items-center gap-2">
            {icons[a.status]}
            <span className="capitalize">{a.status}</span>
          </div>
        )
      },
    },
    {
      key: 'executedAt',
      header: 'Executed',
      render: (a: OptimizerAction) =>
        a.executedAt ? new Date(a.executedAt).toLocaleString() : '-',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <motion.h1
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-2xl font-bold"
          >
            Optimizer
          </motion.h1>
          <p className="text-muted-foreground">
            Automated bid optimization and rule management
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={() => runMutation.mutate()}
            variant="secondary"
            isLoading={runMutation.isPending}
          >
            <Zap className="h-4 w-4" />
            Run Now
          </Button>
          <Button onClick={() => setShowModal(true)}>
            <Plus className="h-4 w-4" />
            Add Rule
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <div className="flex gap-4">
          {(['rules', 'actions'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab === 'rules' ? 'Rules' : 'Action History'}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {activeTab === 'rules' ? (
        <DataTable
          data={rules}
          columns={rulesColumns}
          keyField="id"
          isLoading={rulesLoading}
          emptyMessage="No optimization rules configured."
        />
      ) : (
        <DataTable
          data={actions}
          columns={actionsColumns}
          keyField="id"
          isLoading={actionsLoading}
          emptyMessage="No actions executed yet."
        />
      )}

      {/* Add Rule Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setShowModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md rounded-xl bg-card p-6 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Add Optimization Rule</h2>
                <button onClick={() => setShowModal(false)} className="rounded-lg p-1 hover:bg-muted">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium">Template</label>
                  <select
                    value={form.templateId}
                    onChange={(e) => setForm({ ...form, templateId: e.target.value })}
                    className="w-full rounded-lg border bg-background px-3 py-2"
                  >
                    <option value="">Custom Rule</option>
                    {RULE_TEMPLATES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  {form.templateId && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {RULE_TEMPLATES.find((t) => t.id === form.templateId)?.description}
                    </p>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium">Rule Name (optional)</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="My Custom Rule"
                    className="w-full rounded-lg border bg-background px-3 py-2"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setShowModal(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1" isLoading={createMutation.isPending}>
                    Add Rule
                  </Button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
