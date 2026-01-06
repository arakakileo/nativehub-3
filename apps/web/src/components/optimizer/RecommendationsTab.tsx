import { useState } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, ArrowRight, RefreshCw } from 'lucide-react'
import { Button } from '../ui/Button'
import { DataTable } from '../ui/DataTable'
import { useSourceAccounts } from '../../hooks/useSourceAccounts'
import { useBulkRecommendations } from '../../hooks/useAdvancedOptimizer'
import { formatCurrency, formatPercent } from '../../lib/utils'
import type { BidRecommendation } from '../../lib/api'

export function RecommendationsTab() {
  const { data: accounts = [] } = useSourceAccounts()
  const [selectedAccountId, setSelectedAccountId] = useState<string>('')
  const [targetCpa, setTargetCpa] = useState<number>(25)

  const {
    data: recommendationsData,
    isLoading,
    refetch,
    isFetching,
  } = useBulkRecommendations({
    sourceAccountId: selectedAccountId,
    targetCpa,
    maxBidChange: 30,
  })

  const allRecommendations = recommendationsData?.recommendations?.flatMap(r =>
    r.recommendations.map(rec => ({ ...rec, campaignId: r.campaignId }))
  ) ?? []

  const columns = [
    {
      key: 'campaignName',
      header: 'Campaign',
      render: (r: BidRecommendation) => (
        <span className="font-medium">{r.campaignName}</span>
      ),
    },
    {
      key: 'currentBid',
      header: 'Current Bid',
      render: (r: BidRecommendation) => formatCurrency(r.currentBid),
      className: 'text-right',
    },
    {
      key: 'recommendedBid',
      header: 'Recommended',
      render: (r: BidRecommendation) => (
        <div className="flex items-center justify-end gap-2">
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{formatCurrency(r.recommendedBid)}</span>
        </div>
      ),
      className: 'text-right',
    },
    {
      key: 'bidChange',
      header: 'Change',
      render: (r: BidRecommendation) => (
        <div className={`flex items-center gap-1 ${r.bidChangePercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {r.bidChangePercent >= 0 ? (
            <TrendingUp className="h-4 w-4" />
          ) : (
            <TrendingDown className="h-4 w-4" />
          )}
          <span>{formatPercent(Math.abs(r.bidChangePercent))}</span>
        </div>
      ),
      className: 'text-right',
    },
    {
      key: 'confidence',
      header: 'Confidence',
      render: (r: BidRecommendation) => (
        <div className="flex items-center gap-2">
          <div className="h-2 w-16 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full ${
                r.confidence >= 0.8 ? 'bg-green-500' :
                r.confidence >= 0.6 ? 'bg-yellow-500' : 'bg-red-500'
              }`}
              style={{ width: `${r.confidence * 100}%` }}
            />
          </div>
          <span className="text-sm text-muted-foreground">
            {formatPercent(r.confidence)}
          </span>
        </div>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (r: BidRecommendation) => (
        <span className="text-sm text-muted-foreground">{r.reason}</span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      {/* Controls */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border bg-card p-6"
      >
        <h2 className="mb-4 text-lg font-semibold">Generate Recommendations</h2>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium mb-1">Source Account</label>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="h-10 rounded-lg border bg-background px-3 text-sm min-w-[200px]"
            >
              <option value="">Select account...</option>
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.sourceId})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Target CPA ($)</label>
            <input
              type="number"
              value={targetCpa}
              onChange={(e) => setTargetCpa(Number(e.target.value))}
              className="h-10 rounded-lg border bg-background px-3 text-sm w-24"
              min={1}
              step={5}
            />
          </div>
          <Button
            onClick={() => refetch()}
            disabled={!selectedAccountId || isFetching}
            isLoading={isFetching}
          >
            <RefreshCw className="h-4 w-4" />
            Generate
          </Button>
        </div>
      </motion.div>

      {/* Summary */}
      {recommendationsData?.summary && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid gap-4 md:grid-cols-3"
        >
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">Total Campaigns</p>
            <p className="text-2xl font-bold">{recommendationsData.summary.totalCampaigns}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">With Recommendations</p>
            <p className="text-2xl font-bold">{recommendationsData.summary.campaignsWithRecommendations}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">Avg Confidence</p>
            <p className="text-2xl font-bold">{formatPercent(recommendationsData.summary.avgConfidence)}</p>
          </div>
        </motion.div>
      )}

      {/* Recommendations Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <h2 className="mb-4 text-lg font-semibold">
          Bid Recommendations
          {allRecommendations.length > 0 && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({allRecommendations.length} recommendations)
            </span>
          )}
        </h2>
        <DataTable
          data={allRecommendations}
          columns={columns}
          keyField="campaignId"
          isLoading={isLoading}
          emptyMessage={
            selectedAccountId
              ? "No recommendations found. Try adjusting the target CPA."
              : "Select a source account to generate bid recommendations."
          }
        />
      </motion.div>
    </div>
  )
}
