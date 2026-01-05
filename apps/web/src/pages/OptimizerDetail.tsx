import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Play,
  Settings2,
  ExternalLink,
  CheckCircle,
  AlertCircle,
  Clock,
  Save,
} from 'lucide-react'
import { Button } from '../components/ui/Button'
import { DataTable } from '../components/ui/DataTable'
import { StatusBadge } from '../components/ui/StatusBadge'
import {
  useOptimizerCampaign,
  useUpdateOptimizerCampaign,
  useRunOptimizerCampaign,
  useOptimizerCampaignActions,
} from '../hooks/useOptimizer'
import { useCampaigns } from '../hooks/useCampaigns'
import { useSourceAccounts } from '../hooks/useSourceAccounts'
import { formatCurrency, getSourceColor } from '../lib/utils'
import type { OptimizerAction, OptimizerCampaignRule, SourceAccount } from '../lib/api'

export function OptimizerDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  // Data hooks
  const { data: optCampaign, isLoading } = useOptimizerCampaign(id!)
  const { data: campaigns = [] } = useCampaigns()
  const { data: accounts = [] } = useSourceAccounts()
  const { data: actions = [], isLoading: actionsLoading } = useOptimizerCampaignActions(id!, 20)

  // Mutations
  const updateMutation = useUpdateOptimizerCampaign()
  const runMutation = useRunOptimizerCampaign()

  // Form state
  const [isEditing, setIsEditing] = useState(false)
  const [form, setForm] = useState({
    enabled: true,
    targetCpa: '',
    bidStrategy: 'target_cpa' as 'target_cpa' | 'maximize_conversions' | 'manual',
  })

  // Initialize form when data loads
  if (optCampaign && form.targetCpa === '' && !isEditing) {
    setForm({
      enabled: optCampaign.enabled,
      targetCpa: optCampaign.targetCpa.toString(),
      bidStrategy: optCampaign.bidStrategy,
    })
  }

  // Helpers
  const getCampaignInfo = () => {
    if (!optCampaign) return null
    const campaign = campaigns.find(
      (c) =>
        c.sourceAccountId === optCampaign.sourceAccountId &&
        c.externalCampaignId === optCampaign.externalCampaignId
    )
    const account = accounts.find((a: SourceAccount) => a.id === optCampaign.sourceAccountId)
    return {
      name: campaign?.name || optCampaign.externalCampaignId,
      source: account?.sourceId || 'unknown',
      campaign,
    }
  }

  const handleSave = async () => {
    if (!id) return
    await updateMutation.mutateAsync({
      id,
      data: {
        enabled: form.enabled,
        targetCpa: parseFloat(form.targetCpa),
        bidStrategy: form.bidStrategy,
      },
    })
    setIsEditing(false)
  }

  const handleRun = () => {
    if (!id) return
    runMutation.mutate(id)
  }

  // Rules columns
  const rulesColumns = [
    { key: 'name', header: 'Rule Name' },
    {
      key: 'ruleType',
      header: 'Type',
      render: (r: OptimizerCampaignRule) => (
        <span className="capitalize">{r.ruleType}</span>
      ),
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

  // Actions columns
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (!optCampaign) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Optimizer campaign not found</p>
        <Button variant="ghost" onClick={() => navigate('/optimizer')}>
          Back to Optimizer
        </Button>
      </div>
    )
  }

  const campaignInfo = getCampaignInfo()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/optimizer')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <motion.h1
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-2xl font-bold flex items-center gap-3"
            >
              <span className={`h-3 w-3 rounded-full ${getSourceColor(campaignInfo?.source || 'unknown')}`} />
              {campaignInfo?.name}
            </motion.h1>
            <p className="text-muted-foreground capitalize">{campaignInfo?.source}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link to={`/optimizer/${id}/widgets`}>
            <Button variant="outline">
              <ExternalLink className="h-4 w-4" />
              View Widgets
            </Button>
          </Link>
          <Button
            onClick={handleRun}
            variant="secondary"
            isLoading={runMutation.isPending}
            disabled={!optCampaign.enabled}
          >
            <Play className="h-4 w-4" />
            Run Optimization
          </Button>
        </div>
      </div>

      {/* Settings Card */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Optimizer Settings
          </h2>
          {!isEditing ? (
            <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
              Edit
            </Button>
          ) : (
            <div className="flex gap-2">
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
            </div>
          )}
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
                  setForm({ ...form, bidStrategy: e.target.value as typeof form.bidStrategy })
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
            <p className="mt-1 font-medium">
              {new Date(optCampaign.updatedAt).toLocaleString()}
            </p>
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

      {/* Action History */}
      <div className="rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4">Recent Actions</h2>
        <DataTable
          data={actions}
          columns={actionsColumns}
          keyField="id"
          isLoading={actionsLoading}
          emptyMessage="No actions executed yet."
        />
      </div>
    </div>
  )
}
