import { useState } from 'react'
import { motion } from 'framer-motion'
import { Filter, RefreshCw, Pause, Play, ChevronUp, ChevronDown, Calendar } from 'lucide-react'
import { DataTable } from '../components/ui/DataTable'
import { StatusBadge } from '../components/ui/StatusBadge'
import { Button } from '../components/ui/Button'
import { CardSkeleton } from '../components/ui/Skeleton'
import { useCampaigns, useUpdateCampaign } from '../hooks/useCampaigns'
import { useSourceAccounts } from '../hooks/useSourceAccounts'
import { formatCurrency, formatNumber, getSourceColor } from '../lib/utils'
import type { Campaign, CampaignFilters, SourceAccount } from '../lib/api'

// Date preset helpers
const getDatePreset = (preset: string): { from: string; to: string } => {
  const today = new Date()
  const formatDate = (d: Date) => d.toISOString().split('T')[0]

  switch (preset) {
    case 'last7days': {
      const from = new Date(today)
      from.setDate(today.getDate() - 6) // -6 to include today = 7 days
      return { from: formatDate(from), to: formatDate(today) }
    }
    case 'last3days': {
      const from = new Date(today)
      from.setDate(today.getDate() - 2) // -2 to include today = 3 days
      return { from: formatDate(from), to: formatDate(today) }
    }
    case 'thisMonth': {
      const from = new Date(today.getFullYear(), today.getMonth(), 1)
      return { from: formatDate(from), to: formatDate(today) }
    }
    case 'lastMonth': {
      const from = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const to = new Date(today.getFullYear(), today.getMonth(), 0) // Last day of previous month
      return { from: formatDate(from), to: formatDate(to) }
    }
    default:
      return { from: '', to: '' }
  }
}

const DATE_PRESETS = [
  { key: 'last7days', label: 'Last 7 days' },
  { key: 'last3days', label: 'Last 3 days' },
  { key: 'thisMonth', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' },
] as const

export function Campaigns() {
  const [filters, setFilters] = useState<CampaignFilters>({
    status: 'all',
    sortBy: 'spend',
    sortOrder: 'desc',
  })
  const [activePreset, setActivePreset] = useState<string | null>(null)

  const { data: campaigns = [], isLoading, refetch } = useCampaigns(filters)
  const { data: accounts = [] } = useSourceAccounts()
  const updateMutation = useUpdateCampaign()

  // Update filter helper
  const updateFilter = <K extends keyof CampaignFilters>(key: K, value: CampaignFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value || undefined }))
    // Clear preset when manually changing date filters
    if (key === 'from' || key === 'to') {
      setActivePreset(null)
    }
  }

  // Apply date preset
  const applyDatePreset = (presetKey: string) => {
    const { from, to } = getDatePreset(presetKey)
    setFilters((prev) => ({ ...prev, from, to }))
    setActivePreset(presetKey)
  }

  // Toggle sort helper
  const toggleSort = (column: CampaignFilters['sortBy']) => {
    setFilters((prev) => ({
      ...prev,
      sortBy: column,
      sortOrder: prev.sortBy === column && prev.sortOrder === 'asc' ? 'desc' : 'asc',
    }))
  }

  const toggleStatus = (campaign: Campaign) => {
    const newStatus = campaign.status === 'active' ? 'paused' : 'active'
    updateMutation.mutate({ id: campaign.id, data: { status: newStatus } })
  }

  // Sortable header component
  const SortableHeader = ({
    column,
    label,
    className = '',
  }: {
    column: CampaignFilters['sortBy']
    label: string
    className?: string
  }) => (
    <button
      onClick={() => toggleSort(column)}
      className={`flex items-center gap-1 hover:text-foreground transition-colors ${className}`}
    >
      {label}
      {filters.sortBy === column && (
        filters.sortOrder === 'asc' ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )
      )}
    </button>
  )

  // Get source name from campaign
  const getSourceFromCampaign = (campaign: Campaign) => {
    const account = accounts.find((a: SourceAccount) => a.id === campaign.sourceAccountId)
    return account?.sourceId || 'unknown'
  }

  const columns = [
    {
      key: 'name',
      header: () => <SortableHeader column="name" label="Campaign" />,
      render: (c: Campaign) => {
        const source = getSourceFromCampaign(c)
        return (
          <div className="flex items-center gap-3">
            <span className={`h-2 w-2 rounded-full ${getSourceColor(source)}`} />
            <div>
              <p className="font-medium">{c.name}</p>
              <p className="text-xs text-muted-foreground capitalize">{source}</p>
            </div>
          </div>
        )
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (c: Campaign) => <StatusBadge status={c.status} />,
    },
    {
      key: 'spend',
      header: () => <SortableHeader column="spend" label="Spend" className="justify-end" />,
      render: (c: Campaign) => formatCurrency(c.spend),
      className: 'text-right',
    },
    {
      key: 'impressions',
      header: 'Impr.',
      render: (c: Campaign) => formatNumber(c.impressions),
      className: 'text-right',
    },
    {
      key: 'clicks',
      header: () => <SortableHeader column="clicks" label="Clicks" className="justify-end" />,
      render: (c: Campaign) => formatNumber(c.clicks),
      className: 'text-right',
    },
    {
      key: 'ctr',
      header: 'CTR',
      render: (c: Campaign) => `${c.ctr.toFixed(2)}%`,
      className: 'text-right',
    },
    {
      key: 'cpc',
      header: () => <SortableHeader column="cpc" label="CPC" className="justify-end" />,
      render: (c: Campaign) => formatCurrency(c.cpc),
      className: 'text-right',
    },
    {
      key: 'conversions',
      header: () => <SortableHeader column="conversions" label="Conv." className="justify-end" />,
      render: (c: Campaign) => formatNumber(c.conversions),
      className: 'text-right',
    },
    {
      key: 'cpa',
      header: 'CPA',
      render: (c: Campaign) => formatCurrency(c.cpa),
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
        <Button onClick={() => refetch()} variant="outline">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Filters Bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 flex-wrap"
      >
        <Filter className="h-4 w-4 text-muted-foreground" />

        {/* Source Account Filter */}
        <select
          value={filters.sourceAccountId || ''}
          onChange={(e) => updateFilter('sourceAccountId', e.target.value)}
          className="rounded-lg border bg-background px-3 py-2 text-sm"
        >
          <option value="">All Sources</option>
          {accounts.map((acc: SourceAccount) => (
            <option key={acc.id} value={acc.id}>
              {acc.name}
            </option>
          ))}
        </select>

        {/* Status Filter */}
        <select
          value={filters.status || 'all'}
          onChange={(e) => updateFilter('status', e.target.value as CampaignFilters['status'])}
          className="rounded-lg border bg-background px-3 py-2 text-sm"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="deleted">Deleted</option>
        </select>

        {/* Date From */}
        <div className="flex items-center gap-1">
          <span className="text-sm text-muted-foreground">From:</span>
          <input
            type="date"
            value={filters.from || ''}
            onChange={(e) => updateFilter('from', e.target.value)}
            className="rounded-lg border bg-background px-3 py-2 text-sm"
          />
        </div>

        {/* Date To */}
        <div className="flex items-center gap-1">
          <span className="text-sm text-muted-foreground">To:</span>
          <input
            type="date"
            value={filters.to || ''}
            onChange={(e) => updateFilter('to', e.target.value)}
            className="rounded-lg border bg-background px-3 py-2 text-sm"
          />
        </div>

        {/* Date Presets */}
        <div className="flex items-center gap-1 border-l pl-3 ml-1">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          {DATE_PRESETS.map((preset) => (
            <button
              key={preset.key}
              onClick={() => applyDatePreset(preset.key)}
              className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                activePreset === preset.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-muted/80 text-muted-foreground'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Clear filters */}
        {(filters.from || filters.to || filters.status !== 'all' || filters.sourceAccountId) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilters({
                status: 'all',
                sortBy: filters.sortBy,
                sortOrder: filters.sortOrder,
              })
              setActivePreset(null)
            }}
          >
            Clear Filters
          </Button>
        )}
      </motion.div>

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
              { label: 'Total Spend', value: formatCurrency(campaigns.reduce((sum: number, c: Campaign) => sum + c.spend, 0)) },
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
