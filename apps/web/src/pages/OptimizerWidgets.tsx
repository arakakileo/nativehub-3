import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Ban, CheckCircle, Globe, TrendingUp, TrendingDown } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { DataTable } from '../components/ui/DataTable'
import { useOptimizerCampaign } from '../hooks/useOptimizer'
import { useCampaigns } from '../hooks/useCampaigns'
import { useSourceAccounts } from '../hooks/useSourceAccounts'
import {
  useCampaignWidgets,
  useBlacklist,
  useAddToBlacklist,
  useRemoveFromBlacklist,
} from '../hooks/useWidgets'
import { formatCurrency, getSourceColor } from '../lib/utils'
import type { Widget, BlacklistEntry, SourceAccount } from '../lib/api'

type TabType = 'active' | 'blacklisted'

export function OptimizerWidgets() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabType>('active')

  // Data hooks
  const { data: optCampaign, isLoading: campaignLoading } = useOptimizerCampaign(id!)
  const { data: campaigns = [] } = useCampaigns()
  const { data: accounts = [] } = useSourceAccounts()
  const { data: blacklist = [] } = useBlacklist()

  // Get widgets for this campaign
  const { data: widgets = [], isLoading: widgetsLoading } = useCampaignWidgets(
    optCampaign?.sourceAccountId || '',
    optCampaign?.externalCampaignId || ''
  )

  // Mutations
  const addToBlacklist = useAddToBlacklist()
  const removeFromBlacklist = useRemoveFromBlacklist()

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
    }
  }

  const getSourceId = () => {
    if (!optCampaign) return 'unknown'
    const account = accounts.find((a: SourceAccount) => a.id === optCampaign.sourceAccountId)
    return account?.sourceId || 'unknown'
  }

  // Filter widgets by blacklist status
  const blacklistedIds = new Set(blacklist.map((b) => b.widgetId))
  const activeWidgets = widgets.filter((w) => !blacklistedIds.has(w.externalId))
  const blacklistedWidgets = blacklist.filter((b) => b.sourceId === getSourceId())

  const handleBlock = (widget: Widget) => {
    addToBlacklist.mutate({
      widgetId: widget.externalId,
      sourceId: getSourceId(),
      reason: 'Blocked from optimizer',
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

  if (campaignLoading) {
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
          <Button variant="ghost" size="sm" onClick={() => navigate(`/optimizer/${id}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <motion.h1
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-2xl font-bold flex items-center gap-3"
            >
              <span className={`h-3 w-3 rounded-full ${getSourceColor(campaignInfo?.source || 'unknown')}`} />
              {campaignInfo?.name} - Widgets
            </motion.h1>
            <p className="text-muted-foreground">
              Target CPA: {formatCurrency(optCampaign.targetCpa)}
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total Spend</p>
          <p className="text-2xl font-bold">
            {formatCurrency(widgets.reduce((sum, w) => sum + w.metrics.spend, 0))}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <div className="flex gap-4">
          {([
            { key: 'active', label: 'Active Widgets', count: activeWidgets.length },
            { key: 'blacklisted', label: 'Blacklisted', count: blacklistedWidgets.length },
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
              <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {activeTab === 'active' && (
        <DataTable
          data={activeWidgets}
          columns={activeColumns}
          keyField="id"
          isLoading={widgetsLoading}
          emptyMessage="No widgets found for this campaign."
        />
      )}

      {activeTab === 'blacklisted' && (
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
