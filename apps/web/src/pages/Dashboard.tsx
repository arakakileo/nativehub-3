import { motion } from 'framer-motion'
import { DollarSign, MousePointer, Eye, TrendingUp, TrendingDown, RefreshCw, Target, Percent, Zap } from 'lucide-react'
import { MetricCard } from '../components/ui/MetricCard'
import { DataTable } from '../components/ui/DataTable'
import { StatusBadge } from '../components/ui/StatusBadge'
import { Button } from '../components/ui/Button'
import { MetricGridSkeleton } from '../components/ui/Skeleton'
import { useCampaigns } from '../hooks/useCampaigns'
import { useSourceAccounts } from '../hooks/useSourceAccounts'
import { useTrends } from '../hooks/useReports'
import { formatCurrency, formatNumber, getSourceColor } from '../lib/utils'
import type { Campaign, SourceAccount } from '../lib/api'

// Trend indicator component
function TrendIndicator({ value, inverse = false }: { value: number | null; inverse?: boolean }) {
  if (value === null) return null

  // For CPA, lower is better (inverse = true)
  const isPositive = inverse ? value < 0 : value > 0
  const Icon = isPositive ? TrendingUp : TrendingDown
  const color = isPositive ? 'text-green-500' : 'text-red-500'

  return (
    <span className={`flex items-center gap-1 text-xs ${color}`}>
      <Icon className="h-3 w-3" />
      {Math.abs(value).toFixed(1)}%
    </span>
  )
}

export function Dashboard() {
  const { data: campaigns = [], isLoading: campaignsLoading, refetch } = useCampaigns()
  const { data: accounts = [], isLoading: accountsLoading } = useSourceAccounts()
  const { data: trends, isLoading: trendsLoading } = useTrends()

  // Calculate aggregate metrics from campaigns
  const metrics = campaigns.reduce(
    (acc: { spend: number; clicks: number; impressions: number; conversions: number }, c: Campaign) => ({
      spend: acc.spend + (c.spend || 0),
      clicks: acc.clicks + (c.clicks || 0),
      impressions: acc.impressions + (c.impressions || 0),
      conversions: acc.conversions + (c.conversions || 0),
    }),
    { spend: 0, clicks: 0, impressions: 0, conversions: 0 }
  )

  // Calculate derived metrics
  const cpa = metrics.conversions > 0 ? metrics.spend / metrics.conversions : 0
  const ctr = metrics.impressions > 0 ? (metrics.clicks / metrics.impressions) * 100 : 0
  const roi = metrics.spend > 0 ? ((metrics.conversions * 50 - metrics.spend) / metrics.spend) * 100 : 0

  // Get WoW trends
  const wowChange = trends?.weekOverWeek?.change

  // Get source name from campaign
  const getSourceFromCampaign = (campaign: Campaign) => {
    const account = accounts.find((a: SourceAccount) => a.id === campaign.sourceAccountId)
    return account?.sourceId || 'unknown'
  }

  const columns = [
    {
      key: 'name',
      header: 'Campaign',
      render: (c: Campaign) => (
        <div className="flex items-center gap-3">
          <span className={`h-2 w-2 rounded-full ${getSourceColor(getSourceFromCampaign(c))}`} />
          <span className="font-medium">{c.name}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (c: Campaign) => <StatusBadge status={c.status} />,
    },
    {
      key: 'spend',
      header: 'Spend',
      render: (c: Campaign) => formatCurrency(c.spend || 0),
      className: 'text-right',
    },
    {
      key: 'clicks',
      header: 'Clicks',
      render: (c: Campaign) => formatNumber(c.clicks || 0),
      className: 'text-right',
    },
    {
      key: 'cpc',
      header: 'CPC',
      render: (c: Campaign) => formatCurrency(c.clicks ? (c.spend || 0) / c.clicks : 0),
      className: 'text-right',
    },
    {
      key: 'conversions',
      header: 'Conv.',
      render: (c: Campaign) => formatNumber(c.conversions || 0),
      className: 'text-right',
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
            Dashboard
          </motion.h1>
          <p className="text-muted-foreground">
            Overview of all your native ad campaigns
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Primary Metrics Grid */}
      {campaignsLoading ? (
        <MetricGridSkeleton />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Total Spend"
            value={metrics.spend}
            format="currency"
            icon={DollarSign}
            iconColor="text-green-600"
            footer={!trendsLoading && wowChange && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>vs last week</span>
                <TrendIndicator value={wowChange.spend} inverse />
              </div>
            )}
          />
          <MetricCard
            title="Total Clicks"
            value={metrics.clicks}
            format="number"
            icon={MousePointer}
            iconColor="text-blue-600"
            footer={!trendsLoading && wowChange && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>vs last week</span>
                <TrendIndicator value={wowChange.clicks} />
              </div>
            )}
          />
          <MetricCard
            title="Impressions"
            value={metrics.impressions}
            format="number"
            icon={Eye}
            iconColor="text-purple-600"
            footer={!trendsLoading && wowChange && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>vs last week</span>
                <TrendIndicator value={wowChange.impressions} />
              </div>
            )}
          />
          <MetricCard
            title="Conversions"
            value={metrics.conversions}
            format="number"
            icon={Zap}
            iconColor="text-yellow-600"
            footer={!trendsLoading && wowChange && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>vs last week</span>
                <TrendIndicator value={wowChange.conversions} />
              </div>
            )}
          />
        </div>
      )}

      {/* Secondary Metrics Grid */}
      {!campaignsLoading && (
        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard
            title="CPA (Cost per Action)"
            value={cpa}
            format="currency"
            icon={Target}
            iconColor="text-red-600"
            footer={!trendsLoading && wowChange && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>vs last week</span>
                <TrendIndicator value={wowChange.cpa} inverse />
              </div>
            )}
          />
          <MetricCard
            title="CTR (Click-Through Rate)"
            value={ctr}
            format="percent"
            icon={Percent}
            iconColor="text-indigo-600"
            footer={!trendsLoading && wowChange && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>vs last week</span>
                <TrendIndicator value={wowChange.ctr} />
              </div>
            )}
          />
          <MetricCard
            title="ROI"
            value={roi}
            format="percent"
            icon={TrendingUp}
            iconColor="text-orange-600"
          />
        </div>
      )}

      {/* Connected Accounts Summary */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-xl border bg-card p-6"
      >
        <h2 className="mb-4 text-lg font-semibold">Connected Accounts</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {accountsLoading ? (
            [...Array(4)].map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
            ))
          ) : accounts.length ? (
            accounts.map((acc: SourceAccount) => (
              <div
                key={acc.id}
                className="flex items-center gap-3 rounded-lg border p-4"
              >
                <div className={`h-3 w-3 rounded-full ${getSourceColor(acc.sourceId)}`} />
                <div>
                  <p className="font-medium">{acc.name}</p>
                  <p className="text-sm text-muted-foreground capitalize">
                    {acc.sourceId}
                  </p>
                </div>
                <StatusBadge status={acc.status} className="ml-auto" />
              </div>
            ))
          ) : (
            <p className="col-span-full text-muted-foreground">
              No accounts connected. Add your first traffic source.
            </p>
          )}
        </div>
      </motion.div>

      {/* Campaigns Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <h2 className="mb-4 text-lg font-semibold">Recent Campaigns</h2>
        <DataTable
          data={campaigns.slice(0, 10)}
          columns={columns}
          keyField="id"
          isLoading={campaignsLoading}
          emptyMessage="No campaigns synced yet. Connect a source account to get started."
        />
      </motion.div>
    </div>
  )
}
