import { useState } from 'react'
import { motion } from 'framer-motion'
import { Filter, RefreshCw, Pause, Play } from 'lucide-react'
import { DataTable } from '../components/ui/DataTable'
import { StatusBadge } from '../components/ui/StatusBadge'
import { Button } from '../components/ui/Button'
import { CardSkeleton } from '../components/ui/Skeleton'
import { useCampaigns, useUpdateCampaign } from '../hooks/useCampaigns'
import { useSourceAccounts } from '../hooks/useSourceAccounts'
import { formatCurrency, formatNumber, getSourceColor } from '../lib/utils'
import type { Campaign, SourceAccount } from '../lib/api'

export function Campaigns() {
  const [selectedSource, setSelectedSource] = useState<string>('')
  const { data: campaigns = [], isLoading, refetch } = useCampaigns(selectedSource || undefined)
  const { data: accounts = [] } = useSourceAccounts()
  const updateMutation = useUpdateCampaign()

  const toggleStatus = (campaign: Campaign) => {
    const newStatus = campaign.status === 'active' ? 'paused' : 'active'
    updateMutation.mutate({ id: campaign.id, data: { status: newStatus } })
  }

  const columns = [
    {
      key: 'name',
      header: 'Campaign',
      render: (c: Campaign) => (
        <div className="flex items-center gap-3">
          <span className={`h-2 w-2 rounded-full ${getSourceColor(c.source)}`} />
          <div>
            <p className="font-medium">{c.name}</p>
            <p className="text-xs text-muted-foreground capitalize">{c.source}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (c: Campaign) => <StatusBadge status={c.status} />,
    },
    {
      key: 'bidAmount',
      header: 'Bid',
      render: (c: Campaign) => formatCurrency(c.bidAmount || 0),
      className: 'text-right',
    },
    {
      key: 'spend',
      header: 'Spend',
      render: (c: Campaign) => formatCurrency(c.spend || 0),
      className: 'text-right',
    },
    {
      key: 'impressions',
      header: 'Impr.',
      render: (c: Campaign) => formatNumber(c.impressions || 0),
      className: 'text-right',
    },
    {
      key: 'clicks',
      header: 'Clicks',
      render: (c: Campaign) => formatNumber(c.clicks || 0),
      className: 'text-right',
    },
    {
      key: 'ctr',
      header: 'CTR',
      render: (c: Campaign) => {
        const ctr = c.impressions ? ((c.clicks || 0) / c.impressions) * 100 : 0
        return `${ctr.toFixed(2)}%`
      },
      className: 'text-right',
    },
    {
      key: 'conversions',
      header: 'Conv.',
      render: (c: Campaign) => formatNumber(c.conversions || 0),
      className: 'text-right',
    },
    {
      key: 'cpa',
      header: 'CPA',
      render: (c: Campaign) => {
        const cpa = c.conversions ? (c.spend || 0) / c.conversions : 0
        return formatCurrency(cpa)
      },
      className: 'text-right',
    },
    {
      key: 'actions',
      header: '',
      render: (c: Campaign) => (
        <Button
          size="sm"
          variant="ghost"
          aria-label={c.status === 'active' ? `Pause ${c.name}` : `Resume ${c.name}`}
          onClick={() => toggleStatus(c)}
          disabled={updateMutation.isPending}
        >
          {c.status === 'active' ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </Button>
      ),
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
            Campaigns
          </motion.h1>
          <p className="text-muted-foreground">
            Manage all your campaigns across sources
          </p>
        </div>
        <div className="flex gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <select
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value)}
              className="rounded-lg border bg-background px-3 py-2 text-sm"
            >
              <option value="">All Sources</option>
              {accounts.map((acc: SourceAccount) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name}
                </option>
              ))}
            </select>
          </div>
          <Button onClick={() => refetch()} variant="outline">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Summary */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-4 gap-4"
      >
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)
          : [
              { label: 'Total Campaigns', value: campaigns.length },
              { label: 'Active', value: campaigns.filter((c: Campaign) => c.status === 'active').length },
              { label: 'Paused', value: campaigns.filter((c: Campaign) => c.status === 'paused').length },
              { label: 'Total Spend', value: formatCurrency(campaigns.reduce((sum: number, c: Campaign) => sum + (c.spend || 0), 0)) },
            ].map((stat, i) => (
              <div key={i} className="rounded-lg border bg-card p-4">
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className="mt-1 text-2xl font-bold">{stat.value}</p>
              </div>
            ))}
      </motion.div>

      {/* Table */}
      <DataTable
        data={campaigns}
        columns={columns}
        keyField="id"
        isLoading={isLoading}
        emptyMessage="No campaigns found. Sync your source accounts to import campaigns."
      />
    </div>
  )
}
