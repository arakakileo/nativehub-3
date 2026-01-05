import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Play,
  Pause,
  Settings2,
  Globe,
  Ban,
  CheckCircle,
  AlertCircle,
  Clock,
  Save,
  TrendingUp,
  TrendingDown,
} from 'lucide-react'
import { Button } from '../components/ui/Button'
import { DataTable } from '../components/ui/DataTable'
import { StatusBadge } from '../components/ui/StatusBadge'
import { useCampaigns, useUpdateCampaign } from '../hooks/useCampaigns'
import { useSourceAccounts } from '../hooks/useSourceAccounts'
import {
  useOptimizerCampaignByIds,
  useCreateOptimizerCampaign,
  useUpdateOptimizerCampaign,
  useRunOptimizerCampaign,
  useOptimizerCampaignActions,
} from '../hooks/useOptimizer'
import {
  useCampaignWidgets,
  useBlacklist,
  useAddToBlacklist,
  useRemoveFromBlacklist,
} from '../hooks/useWidgets'
import { formatCurrency, formatNumber, getSourceColor } from '../lib/utils'
import type {
  Campaign,
  SourceAccount,
  OptimizerCampaignDetail,
  OptimizerAction,
  OptimizerCampaignRule,
  Widget,
  BlacklistEntry,
} from '../lib/api'

type TabType = 'overview' | 'optimizer' | 'widgets' | 'actions'

export function CampaignDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabType>('overview')

  // Parse composite ID: sourceAccountId_externalCampaignId
  const [sourceAccountId, externalCampaignId] = id?.split('_') || []

  // Data hooks
  const { data: campaigns = [], isLoading: campaignsLoading } = useCampaigns()
  const { data: accounts = [] } = useSourceAccounts()
  const { data: optCampaign } = useOptimizerCampaignByIds(sourceAccountId, externalCampaignId)
  const updateCampaignMutation = useUpdateCampaign()

  // Find current campaign
  const campaign = campaigns.find(
    (c) => c.sourceAccountId === sourceAccountId && c.externalCampaignId === externalCampaignId
  )

  // Get source info
  const account = accounts.find((a: SourceAccount) => a.id === sourceAccountId)
  const sourceId = account?.sourceId || 'unknown'

  if (campaignsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (!campaign) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Campaign not found</p>
        <Button variant="ghost" onClick={() => navigate('/campaigns')}>
          Back to Campaigns
        </Button>
      </div>
    )
  }

  const toggleStatus = () => {
    const newStatus = campaign.status === 'active' ? 'paused' : 'active'
    updateCampaignMutation.mutate({ id: campaign.id, data: { status: newStatus } })
  }

  const tabs = [
    { key: 'overview' as const, label: 'Overview' },
    { key: 'optimizer' as const, label: 'Optimizer' },
    { key: 'widgets' as const, label: 'Widgets' },
    { key: 'actions' as const, label: 'Actions' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/campaigns')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <motion.h1
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-2xl font-bold flex items-center gap-3"
            >
              <span className={`h-3 w-3 rounded-full ${getSourceColor(sourceId)}`} />
              {campaign.name}
            </motion.h1>
            <p className="text-muted-foreground capitalize">{sourceId}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={campaign.status} />
          <Button
            variant="outline"
            onClick={toggleStatus}
            disabled={updateCampaignMutation.isPending}
          >
            {campaign.status === 'active' ? (
              <>
                <Pause className="h-4 w-4" /> Pause
              </>
            ) : (
              <>
                <Play className="h-4 w-4" /> Resume
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <div className="flex gap-4">
          {tabs.map((tab) => (
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
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && <OverviewTab campaign={campaign} />}
      {activeTab === 'optimizer' && (
        <OptimizerTab
          optCampaign={optCampaign}
          sourceAccountId={sourceAccountId}
          externalCampaignId={externalCampaignId}
        />
      )}
      {activeTab === 'widgets' && (
        <WidgetsTab
          sourceAccountId={sourceAccountId}
          externalCampaignId={externalCampaignId}
          sourceId={sourceId}
          optCampaign={optCampaign}
        />
      )}
      {activeTab === 'actions' && <ActionsTab optCampaignId={optCampaign?.id} />}
    </div>
  )
}

// === Overview Tab ===
function OverviewTab({ campaign }: { campaign: Campaign }) {
  const metrics = [
    { label: 'Spend', value: formatCurrency(campaign.spend) },
    { label: 'Impressions', value: formatNumber(campaign.impressions) },
    { label: 'Clicks', value: formatNumber(campaign.clicks) },
    { label: 'CTR', value: `${campaign.ctr.toFixed(2)}%` },
    { label: 'CPC', value: formatCurrency(campaign.cpc) },
    { label: 'Conversions', value: formatNumber(campaign.conversions) },
    { label: 'CPA', value: formatCurrency(campaign.cpa) },
  ]

  return (
    <div className="space-y-6">
      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">{metric.label}</p>
            <p className="text-xl font-bold mt-1">{metric.value}</p>
          </div>
        ))}
      </div>

      {/* Campaign Details */}
      <div className="rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4">Campaign Details</h2>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-muted-foreground">External ID</dt>
            <dd className="font-mono">{campaign.externalCampaignId}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Last Synced</dt>
            <dd>{new Date(campaign.syncedAt).toLocaleString()}</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}

// === Optimizer Tab ===
function OptimizerTab({
  optCampaign,
  sourceAccountId,
  externalCampaignId,
}: {
  optCampaign?: OptimizerCampaignDetail
  sourceAccountId: string
  externalCampaignId: string
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [form, setForm] = useState({
    enabled: optCampaign?.enabled ?? true,
    targetCpa: optCampaign?.targetCpa?.toString() ?? '10.00',
    bidStrategy: optCampaign?.bidStrategy ?? ('target_cpa' as const),
  })

  const createMutation = useCreateOptimizerCampaign()
  const updateMutation = useUpdateOptimizerCampaign()
  const runMutation = useRunOptimizerCampaign()

  // If no optimizer config, show enable button
  if (!optCampaign) {
    const handleEnable = () => {
      createMutation.mutate({
        sourceAccountId,
        externalCampaignId,
        targetCpa: 10.0,
        bidStrategy: 'target_cpa',
      })
    }

    return (
      <div className="text-center py-12 border rounded-lg bg-card">
        <Settings2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">Optimizer Not Configured</h3>
        <p className="text-muted-foreground mb-4">
          Enable the optimizer to automatically manage bids and block underperforming widgets.
        </p>
        <Button onClick={handleEnable} isLoading={createMutation.isPending}>
          Enable Optimizer
        </Button>
      </div>
    )
  }

  const handleSave = async () => {
    await updateMutation.mutateAsync({
      id: optCampaign.id,
      data: {
        enabled: form.enabled,
        targetCpa: parseFloat(form.targetCpa),
        bidStrategy: form.bidStrategy,
      },
    })
    setIsEditing(false)
  }

  const handleRun = () => {
    runMutation.mutate(optCampaign.id)
  }

  // Rules columns
  const rulesColumns = [
    { key: 'name', header: 'Rule Name' },
    {
      key: 'ruleType',
      header: 'Type',
      render: (r: OptimizerCampaignRule) => <span className="capitalize">{r.ruleType}</span>,
    },
    {
      key: 'templateId',
      header: 'Template',
      render: (r: OptimizerCampaignRule) => (
        <span className="capitalize">{r.templateId?.replace(/_/g, ' ') || '-'}</span>
      ),
    },
    {
      key: 'enabled',
      header: 'Status',
      render: (r: OptimizerCampaignRule) => (
        <StatusBadge status={r.enabled ? 'active' : 'paused'} />
      ),
    },
    {
      key: 'priority',
      header: 'Priority',
      render: (r: OptimizerCampaignRule) => r.priority,
      className: 'text-right',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Settings Card */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Optimizer Settings
          </h2>
          <div className="flex gap-2">
            {!isEditing ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  onClick={handleRun}
                  isLoading={runMutation.isPending}
                  disabled={!optCampaign.enabled}
                >
                  <Play className="h-4 w-4" />
                  Run Now
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsEditing(false)
                    setForm({
                      enabled: optCampaign.enabled,
                      targetCpa: optCampaign.targetCpa.toString(),
                      bidStrategy: optCampaign.bidStrategy,
                    })
                  }}
                >
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSave} isLoading={updateMutation.isPending}>
                  <Save className="h-4 w-4" />
                  Save
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Status */}
          <div>
            <label className="text-sm text-muted-foreground">Status</label>
            {isEditing ? (
              <div className="mt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.enabled}
                    onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm">{form.enabled ? 'Enabled' : 'Disabled'}</span>
                </label>
              </div>
            ) : (
              <p className="mt-1 font-medium">
                <StatusBadge status={optCampaign.enabled ? 'active' : 'paused'} />
              </p>
            )}
          </div>

          {/* Target CPA */}
          <div>
            <label className="text-sm text-muted-foreground">Target CPA</label>
            {isEditing ? (
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={form.targetCpa}
                onChange={(e) => setForm({ ...form, targetCpa: e.target.value })}
                className="mt-1 w-full rounded-lg border bg-background px-3 py-1.5 text-sm"
              />
            ) : (
              <p className="mt-1 font-medium">{formatCurrency(optCampaign.targetCpa)}</p>
            )}
          </div>

          {/* Bid Strategy */}
          <div>
            <label className="text-sm text-muted-foreground">Bid Strategy</label>
            {isEditing ? (
              <select
                value={form.bidStrategy}
                onChange={(e) =>
                  setForm({
                    ...form,
                    bidStrategy: e.target.value as 'target_cpa' | 'maximize_conversions' | 'manual',
                  })
                }
                className="mt-1 w-full rounded-lg border bg-background px-3 py-1.5 text-sm"
              >
                <option value="target_cpa">Target CPA</option>
                <option value="maximize_conversions">Maximize Conversions</option>
                <option value="manual">Manual</option>
              </select>
            ) : (
              <p className="mt-1 font-medium capitalize">
                {optCampaign.bidStrategy.replace(/_/g, ' ')}
              </p>
            )}
          </div>

          {/* Last Updated */}
          <div>
            <label className="text-sm text-muted-foreground">Last Updated</label>
            <p className="mt-1 font-medium">{new Date(optCampaign.updatedAt).toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Rules Section */}
      <div className="rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4">Optimization Rules</h2>
        <DataTable
          data={optCampaign.rules || []}
          columns={rulesColumns}
          keyField="id"
          emptyMessage="No rules configured for this campaign."
        />
      </div>
    </div>
  )
}

// === Widgets Tab ===
function WidgetsTab({
  sourceAccountId,
  externalCampaignId,
  sourceId,
  optCampaign,
}: {
  sourceAccountId: string
  externalCampaignId: string
  sourceId: string
  optCampaign?: OptimizerCampaignDetail
}) {
  const [widgetTab, setWidgetTab] = useState<'active' | 'blacklisted'>('active')

  const { data: widgets = [], isLoading } = useCampaignWidgets(sourceAccountId, externalCampaignId)
  const { data: blacklist = [] } = useBlacklist()

  const addToBlacklist = useAddToBlacklist()
  const removeFromBlacklist = useRemoveFromBlacklist()

  // Filter widgets
  const blacklistedIds = new Set(blacklist.map((b) => b.widgetId))
  const activeWidgets = widgets.filter((w) => !blacklistedIds.has(w.externalId))
  const blacklistedWidgets = blacklist.filter((b) => b.sourceId === sourceId)

  const handleBlock = (widget: Widget) => {
    addToBlacklist.mutate({
      widgetId: widget.externalId,
      sourceId,
      reason: 'Blocked from campaign detail',
    })
  }

  const handleUnblock = (entry: BlacklistEntry) => {
    removeFromBlacklist.mutate(entry.id)
  }

  // Active widgets columns
  const activeColumns = [
    {
      key: 'name',
      header: 'Widget / Publisher',
      render: (w: Widget) => (
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="font-medium">{w.name}</p>
            {w.domain && <p className="text-xs text-muted-foreground">{w.domain}</p>}
          </div>
        </div>
      ),
    },
    {
      key: 'spend',
      header: 'Spend',
      render: (w: Widget) => formatCurrency(w.metrics.spend),
      className: 'text-right',
    },
    {
      key: 'clicks',
      header: 'Clicks',
      render: (w: Widget) => w.metrics.clicks.toLocaleString(),
      className: 'text-right',
    },
    {
      key: 'conversions',
      header: 'Conv.',
      render: (w: Widget) => w.metrics.conversions,
      className: 'text-right',
    },
    {
      key: 'cpa',
      header: 'CPA',
      render: (w: Widget) => {
        const cpa = w.metrics.cpa
        const targetCpa = optCampaign?.targetCpa || 0
        const isHigh = cpa > targetCpa * 1.5
        const isLow = cpa < targetCpa && cpa > 0
        return (
          <div className="flex items-center justify-end gap-1">
            {isHigh && <TrendingUp className="h-4 w-4 text-red-500" />}
            {isLow && <TrendingDown className="h-4 w-4 text-green-500" />}
            <span className={isHigh ? 'text-red-500' : isLow ? 'text-green-500' : ''}>
              {formatCurrency(cpa)}
            </span>
          </div>
        )
      },
      className: 'text-right',
    },
    {
      key: 'ctr',
      header: 'CTR',
      render: (w: Widget) => `${(w.metrics.ctr * 100).toFixed(2)}%`,
      className: 'text-right',
    },
    {
      key: 'actions',
      header: '',
      render: (w: Widget) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => handleBlock(w)}
          disabled={addToBlacklist.isPending}
          title="Block widget"
        >
          <Ban className="h-4 w-4 text-destructive" />
        </Button>
      ),
    },
  ]

  // Blacklisted widgets columns
  const blacklistedColumns = [
    {
      key: 'widgetId',
      header: 'Widget ID',
      render: (b: BlacklistEntry) => (
        <div className="flex items-center gap-2">
          <Ban className="h-4 w-4 text-red-500" />
          <span className="font-mono text-sm">{b.widgetId}</span>
        </div>
      ),
    },
    { key: 'reason', header: 'Reason' },
    {
      key: 'createdAt',
      header: 'Blocked Date',
      render: (b: BlacklistEntry) => new Date(b.createdAt).toLocaleDateString(),
    },
    {
      key: 'actions',
      header: '',
      render: (b: BlacklistEntry) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => handleUnblock(b)}
          disabled={removeFromBlacklist.isPending}
          title="Unblock widget"
        >
          <CheckCircle className="h-4 w-4 text-green-500" />
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total Widgets</p>
          <p className="text-2xl font-bold">{widgets.length}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Active</p>
          <p className="text-2xl font-bold text-green-500">{activeWidgets.length}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Blacklisted</p>
          <p className="text-2xl font-bold text-red-500">{blacklistedWidgets.length}</p>
        </div>
      </div>

      {/* Widget Tabs */}
      <div className="border-b">
        <div className="flex gap-4">
          {(
            [
              { key: 'active', label: 'Active Widgets', count: activeWidgets.length },
              { key: 'blacklisted', label: 'Blacklisted', count: blacklistedWidgets.length },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setWidgetTab(tab.key)}
              className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                widgetTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
              <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">{tab.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Widget Table */}
      {widgetTab === 'active' && (
        <DataTable
          data={activeWidgets}
          columns={activeColumns}
          keyField="id"
          isLoading={isLoading}
          emptyMessage="No widgets found for this campaign."
        />
      )}

      {widgetTab === 'blacklisted' && (
        <DataTable
          data={blacklistedWidgets}
          columns={blacklistedColumns}
          keyField="id"
          emptyMessage="No widgets are blacklisted."
        />
      )}
    </div>
  )
}

// === Actions Tab ===
function ActionsTab({ optCampaignId }: { optCampaignId?: string }) {
  const { data: actions = [], isLoading } = useOptimizerCampaignActions(optCampaignId || '', 50)

  if (!optCampaignId) {
    return (
      <div className="text-center py-12 border rounded-lg bg-card">
        <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground">
          Enable the optimizer to see action history.
        </p>
      </div>
    )
  }

  const columns = [
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
    <DataTable
      data={actions}
      columns={columns}
      keyField="id"
      isLoading={isLoading}
      emptyMessage="No actions executed yet."
    />
  )
}
