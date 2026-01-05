import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Zap,
  Plus,
  Play,
  Settings,
  Clock,
  CheckCircle,
  AlertCircle,
  Activity,
  Trash2,
} from 'lucide-react'
import { DataTable } from '../components/ui/DataTable'
import { StatusBadge } from '../components/ui/StatusBadge'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import {
  useOptimizerCampaigns,
  useOptimizerStatus,
  useOptimizerRules,
  useOptimizerActions,
  useRunOptimizer,
  useRunOptimizerCampaign,
  useCreateOptimizerCampaign,
  useDeleteOptimizerRule,
} from '../hooks/useOptimizer'
import { useCampaigns } from '../hooks/useCampaigns'
import { useSourceAccounts } from '../hooks/useSourceAccounts'
import { formatCurrency, getSourceColor } from '../lib/utils'
import type { OptimizerCampaign, OptimizerRule, OptimizerAction, Campaign, SourceAccount } from '../lib/api'

type TabType = 'campaigns' | 'rules' | 'actions'

// Scheduler Status Card Component
function SchedulerStatusCard() {
  const { data: status, isLoading } = useOptimizerStatus()

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-2">
        <div className="h-2 w-2 rounded-full bg-muted animate-pulse" />
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>
    )
  }

  const isActive = status?.scheduler?.active
  const cron = status?.scheduler?.cron
  const pendingJobs = status?.queue?.pending ?? 0
  const activeJobs = status?.queue?.active ?? 0

  return (
    <div className="flex items-center gap-4 rounded-lg border bg-card px-4 py-2">
      <div className="flex items-center gap-2">
        <div className={`h-2 w-2 rounded-full ${isActive ? 'bg-green-500' : 'bg-yellow-500'}`} />
        <span className="text-sm font-medium">
          {isActive ? 'Scheduler Active' : 'Scheduler Inactive'}
        </span>
      </div>
      {cron && (
        <span className="text-xs text-muted-foreground">
          <Clock className="inline h-3 w-3 mr-1" />
          {cron}
        </span>
      )}
      {(pendingJobs > 0 || activeJobs > 0) && (
        <span className="text-xs text-muted-foreground">
          <Activity className="inline h-3 w-3 mr-1" />
          {activeJobs} running, {pendingJobs} pending
        </span>
      )}
    </div>
  )
}

// Add Campaign Modal Component
function AddCampaignModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) {
  const { data: campaigns = [] } = useCampaigns()
  const { data: accounts = [] } = useSourceAccounts()
  const { data: existingOptCampaigns = [] } = useOptimizerCampaigns()
  const createMutation = useCreateOptimizerCampaign()

  const [form, setForm] = useState({
    campaignId: '',
    targetCpa: '',
    bidStrategy: 'target_cpa' as const,
  })

  // Filter out campaigns that already have optimizer
  const existingIds = new Set(
    existingOptCampaigns.map((c) => `${c.sourceAccountId}-${c.externalCampaignId}`)
  )
  const availableCampaigns = campaigns.filter(
    (c) => !existingIds.has(`${c.sourceAccountId}-${c.externalCampaignId}`)
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const campaign = campaigns.find((c) => c.id === form.campaignId)
    if (!campaign) return

    await createMutation.mutateAsync({
      sourceAccountId: campaign.sourceAccountId,
      externalCampaignId: campaign.externalCampaignId,
      targetCpa: parseFloat(form.targetCpa),
      bidStrategy: form.bidStrategy,
    })

    setForm({ campaignId: '', targetCpa: '', bidStrategy: 'target_cpa' })
    onClose()
  }

  const getSourceForCampaign = (campaign: Campaign) => {
    const account = accounts.find((a: SourceAccount) => a.id === campaign.sourceAccountId)
    return account?.sourceId || 'unknown'
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Enable Optimizer for Campaign">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Select Campaign</label>
          <select
            value={form.campaignId}
            onChange={(e) => setForm({ ...form, campaignId: e.target.value })}
            className="w-full rounded-lg border bg-background px-3 py-2"
            required
          >
            <option value="">Choose a campaign...</option>
            {availableCampaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({getSourceForCampaign(c)})
              </option>
            ))}
          </select>
          {availableCampaigns.length === 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              All campaigns already have optimizer enabled
            </p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Target CPA ($)</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={form.targetCpa}
            onChange={(e) => setForm({ ...form, targetCpa: e.target.value })}
            placeholder="15.00"
            className="w-full rounded-lg border bg-background px-3 py-2"
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Bid Strategy</label>
          <select
            value={form.bidStrategy}
            onChange={(e) =>
              setForm({ ...form, bidStrategy: e.target.value as typeof form.bidStrategy })
            }
            className="w-full rounded-lg border bg-background px-3 py-2"
          >
            <option value="target_cpa">Target CPA</option>
            <option value="maximize_conversions">Maximize Conversions</option>
            <option value="manual">Manual</option>
          </select>
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            className="flex-1"
            isLoading={createMutation.isPending}
            disabled={!form.campaignId || !form.targetCpa}
          >
            Enable Optimizer
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export function Optimizer() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabType>('campaigns')
  const [showAddModal, setShowAddModal] = useState(false)

  // Data hooks
  const { data: optCampaigns = [], isLoading: campaignsLoading } = useOptimizerCampaigns()
  const { data: campaigns = [] } = useCampaigns()
  const { data: accounts = [] } = useSourceAccounts()
  const { data: rules = [], isLoading: rulesLoading } = useOptimizerRules()
  const { data: actions = [], isLoading: actionsLoading } = useOptimizerActions()

  // Mutations
  const runAllMutation = useRunOptimizer()
  const runCampaignMutation = useRunOptimizerCampaign()
  const deleteRuleMutation = useDeleteOptimizerRule()

  // Helpers
  const getCampaignName = (optCampaign: OptimizerCampaign) => {
    const campaign = campaigns.find(
      (c) =>
        c.sourceAccountId === optCampaign.sourceAccountId &&
        c.externalCampaignId === optCampaign.externalCampaignId
    )
    return campaign?.name || optCampaign.externalCampaignId
  }

  const getSourceId = (optCampaign: OptimizerCampaign) => {
    const account = accounts.find((a: SourceAccount) => a.id === optCampaign.sourceAccountId)
    return account?.sourceId || 'unknown'
  }

  // Table columns for Campaigns tab
  const campaignColumns = [
    {
      key: 'name',
      header: 'Campaign',
      render: (c: OptimizerCampaign) => {
        const source = getSourceId(c)
        return (
          <div
            className="flex items-center gap-3 cursor-pointer"
            onClick={() => navigate(`/optimizer/${c.id}`)}
          >
            <span className={`h-2 w-2 rounded-full ${getSourceColor(source)}`} />
            <div>
              <p className="font-medium hover:text-primary">{getCampaignName(c)}</p>
              <p className="text-xs text-muted-foreground capitalize">{source}</p>
            </div>
          </div>
        )
      },
    },
    {
      key: 'targetCpa',
      header: 'Target CPA',
      render: (c: OptimizerCampaign) => formatCurrency(c.targetCpa),
      className: 'text-right',
    },
    {
      key: 'bidStrategy',
      header: 'Strategy',
      render: (c: OptimizerCampaign) => (
        <span className="capitalize text-sm">{c.bidStrategy.replace(/_/g, ' ')}</span>
      ),
    },
    {
      key: 'enabled',
      header: 'Status',
      render: (c: OptimizerCampaign) => (
        <StatusBadge status={c.enabled ? 'active' : 'paused'} />
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (c: OptimizerCampaign) => (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation()
              runCampaignMutation.mutate(c.id)
            }}
            disabled={runCampaignMutation.isPending}
            title="Run optimization"
          >
            <Play className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation()
              navigate(`/optimizer/${c.id}`)
            }}
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ]

  // Table columns for Rules tab
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
            if (confirm('Delete this rule?')) deleteRuleMutation.mutate(r.id)
          }}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      ),
    },
  ]

  // Table columns for Actions tab
  const actionsColumns = [
    {
      key: 'actionType',
      header: 'Action',
      render: (a: OptimizerAction) => (
        <span className="capitalize">{a.actionType.replace(/_/g, ' ')}</span>
      ),
    },
    {
      key: 'targetName',
      header: 'Target',
      render: (a: OptimizerAction) => a.targetName || a.targetId,
    },
    { key: 'reason', header: 'Reason' },
    {
      key: 'executed',
      header: 'Status',
      render: (a: OptimizerAction) => {
        const icon = a.executed ? (
          a.error ? (
            <AlertCircle className="h-4 w-4 text-red-500" />
          ) : (
            <CheckCircle className="h-4 w-4 text-green-500" />
          )
        ) : (
          <Clock className="h-4 w-4 text-yellow-500" />
        )
        const label = a.executed ? (a.error ? 'Failed' : 'Executed') : 'Pending'
        return (
          <div className="flex items-center gap-2">
            {icon}
            <span className="capitalize">{label}</span>
          </div>
        )
      },
    },
    {
      key: 'createdAt',
      header: 'Date',
      render: (a: OptimizerAction) => new Date(a.createdAt).toLocaleString(),
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
        <div className="flex items-center gap-3">
          <SchedulerStatusCard />
          <Button
            onClick={() => runAllMutation.mutate()}
            variant="secondary"
            isLoading={runAllMutation.isPending}
          >
            <Zap className="h-4 w-4" />
            Run All
          </Button>
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="h-4 w-4" />
            Add Campaign
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <div className="flex gap-4">
          {([
            { key: 'campaigns', label: 'Campaigns' },
            { key: 'rules', label: 'Rules' },
            { key: 'actions', label: 'Action History' },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
              {tab.key === 'campaigns' && optCampaigns.length > 0 && (
                <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">
                  {optCampaigns.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {activeTab === 'campaigns' && (
        <DataTable
          data={optCampaigns}
          columns={campaignColumns}
          keyField="id"
          isLoading={campaignsLoading}
          emptyMessage="No optimizer campaigns configured. Click 'Add Campaign' to enable optimization for a campaign."
          onRowClick={(row) => navigate(`/optimizer/${row.id}`)}
        />
      )}

      {activeTab === 'rules' && (
        <DataTable
          data={rules}
          columns={rulesColumns}
          keyField="id"
          isLoading={rulesLoading}
          emptyMessage="No optimization rules configured."
        />
      )}

      {activeTab === 'actions' && (
        <DataTable
          data={actions}
          columns={actionsColumns}
          keyField="id"
          isLoading={actionsLoading}
          emptyMessage="No actions executed yet."
        />
      )}

      {/* Add Campaign Modal */}
      <AddCampaignModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} />
    </div>
  )
}
