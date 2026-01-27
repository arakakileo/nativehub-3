import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  FlaskConical,
  Play,
  Pause,
  Square,
  Trash2,
  Plus,
  Trophy,
  BarChart3,
} from 'lucide-react'
import { Button } from '../ui/Button'
import { DataTable } from '../ui/DataTable'
import { StatusBadge } from '../ui/StatusBadge'
import { Modal } from '../ui/Modal'
import {
  useExperiments,
  useCreateExperiment,
  useStartExperiment,
  usePauseExperiment,
  useStopExperiment,
  useDeleteExperiment,
  useExperimentResults,
} from '../../hooks/useAdvancedOptimizer'
import { useSourceAccounts } from '../../hooks/useSourceAccounts'
import { formatDistanceToNow } from 'date-fns'
import { formatCurrency, formatNumber, formatPercent } from '../../lib/utils'
import type { Experiment, CreateExperimentInput } from '../../lib/api'

export function ExperimentsTab() {
  const { data: experimentsData, isLoading } = useExperiments()
  const { data: accounts = [] } = useSourceAccounts()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedExperimentId, setSelectedExperimentId] = useState<string | null>(null)

  const createExperiment = useCreateExperiment()
  const startExperiment = useStartExperiment()
  const pauseExperiment = usePauseExperiment()
  const stopExperiment = useStopExperiment()
  const deleteExperiment = useDeleteExperiment()

  const experiments = experimentsData?.experiments ?? []

  const statusMap: Record<string, 'active' | 'paused' | 'pending' | 'error'> = {
    draft: 'pending',
    running: 'active',
    paused: 'paused',
    completed: 'active',
  }

  const columns = [
    {
      key: 'name',
      header: 'Experiment',
      render: (e: Experiment) => (
        <div>
          <span className="font-medium">{e.name}</span>
          {e.description && (
            <p className="text-sm text-muted-foreground">{e.description}</p>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (e: Experiment) => <StatusBadge status={statusMap[e.status] ?? 'pending'} />,
    },
    {
      key: 'variants',
      header: 'Variants',
      render: (e: Experiment) => (
        <span className="text-muted-foreground">{e.variantCount} variants</span>
      ),
    },
    {
      key: 'campaigns',
      header: 'Campaigns',
      render: (e: Experiment) => formatNumber(e.campaignCount),
      className: 'text-right',
    },
    {
      key: 'started',
      header: 'Started',
      render: (e: Experiment) => (
        <span className="text-sm text-muted-foreground">
          {e.startedAt
            ? formatDistanceToNow(new Date(e.startedAt), { addSuffix: true })
            : 'Not started'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (e: Experiment) => (
        <div className="flex items-center gap-1">
          {e.status === 'draft' && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => startExperiment.mutate(e.id)}
              disabled={startExperiment.isPending}
            >
              <Play className="h-4 w-4" />
            </Button>
          )}
          {e.status === 'running' && (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => pauseExperiment.mutate(e.id)}
                disabled={pauseExperiment.isPending}
              >
                <Pause className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => stopExperiment.mutate(e.id)}
                disabled={stopExperiment.isPending}
              >
                <Square className="h-4 w-4" />
              </Button>
            </>
          )}
          {e.status === 'paused' && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => startExperiment.mutate(e.id)}
              disabled={startExperiment.isPending}
            >
              <Play className="h-4 w-4" />
            </Button>
          )}
          {(e.status === 'running' || e.status === 'completed') && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedExperimentId(e.id)}
            >
              <BarChart3 className="h-4 w-4" />
            </Button>
          )}
          {e.status !== 'running' && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => deleteExperiment.mutate(e.id)}
              disabled={deleteExperiment.isPending}
              className="text-red-600 hover:text-red-700"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">A/B Testing Experiments</h2>
          <p className="text-sm text-muted-foreground">
            Test different optimization strategies and find what works best
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4" />
          New Experiment
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border bg-card p-6"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900">
              <Play className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Running</p>
              <p className="text-2xl font-bold">
                {experiments.filter(e => e.status === 'running').length}
              </p>
            </div>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-xl border bg-card p-6"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-100 dark:bg-yellow-900">
              <FlaskConical className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Draft</p>
              <p className="text-2xl font-bold">
                {experiments.filter(e => e.status === 'draft').length}
              </p>
            </div>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-xl border bg-card p-6"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900">
              <Trophy className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Completed</p>
              <p className="text-2xl font-bold">
                {experiments.filter(e => e.status === 'completed').length}
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Experiments Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <DataTable
          data={experiments}
          columns={columns}
          keyField="id"
          isLoading={isLoading}
          emptyMessage="No experiments yet. Create one to start testing optimization strategies."
        />
      </motion.div>

      {/* Create Experiment Modal */}
      <CreateExperimentModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        accounts={accounts}
        onCreate={(data) => {
          createExperiment.mutate(data)
          setShowCreateModal(false)
        }}
        isCreating={createExperiment.isPending}
      />

      {/* Results Modal */}
      {selectedExperimentId && (
        <ExperimentResultsModal
          experimentId={selectedExperimentId}
          onClose={() => setSelectedExperimentId(null)}
        />
      )}
    </div>
  )
}

function CreateExperimentModal({
  isOpen,
  onClose,
  accounts,
  onCreate,
  isCreating,
}: {
  isOpen: boolean
  onClose: () => void
  accounts: Array<{ id: string; name: string; sourceId: string }>
  onCreate: (data: CreateExperimentInput) => void
  isCreating: boolean
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [sourceAccountId, setSourceAccountId] = useState('')
  const [variants, setVariants] = useState([
    { name: 'Control', description: 'Current strategy', weight: 50 },
    { name: 'Variant A', description: 'Test strategy', weight: 50 },
  ])

  const handleSubmit = () => {
    onCreate({
      name,
      description,
      sourceAccountId,
      variants,
    })
  }

  const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0)

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Experiment">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full h-10 rounded-lg border bg-background px-3 text-sm"
            placeholder="e.g., Bid Strategy Test"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            rows={2}
            placeholder="What are you testing?"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Source Account</label>
          <select
            value={sourceAccountId}
            onChange={(e) => setSourceAccountId(e.target.value)}
            className="w-full h-10 rounded-lg border bg-background px-3 text-sm"
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
          <label className="block text-sm font-medium mb-2">Variants</label>
          <div className="space-y-2">
            {variants.map((v, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  type="text"
                  value={v.name}
                  onChange={(e) => {
                    const newVariants = [...variants]
                    newVariants[i].name = e.target.value
                    setVariants(newVariants)
                  }}
                  className="flex-1 h-9 rounded-lg border bg-background px-3 text-sm"
                  placeholder="Variant name"
                />
                <input
                  type="number"
                  value={v.weight}
                  onChange={(e) => {
                    const newVariants = [...variants]
                    newVariants[i].weight = Number(e.target.value)
                    setVariants(newVariants)
                  }}
                  className="w-20 h-9 rounded-lg border bg-background px-3 text-sm text-right"
                  min={0}
                  max={100}
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            ))}
          </div>
          {totalWeight !== 100 && (
            <p className="text-sm text-yellow-600 mt-2">
              Weights should sum to 100% (currently {totalWeight}%)
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!name || !sourceAccountId || totalWeight !== 100 || isCreating}
            isLoading={isCreating}
          >
            Create Experiment
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function ExperimentResultsModal({
  experimentId,
  onClose,
}: {
  experimentId: string
  onClose: () => void
}) {
  const { data: results, isLoading } = useExperimentResults(experimentId)

  return (
    <Modal isOpen={true} onClose={onClose} title="Experiment Results">
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : results ? (
        <div className="space-y-4">
          {/* Winner announcement */}
          {results.winner && (
            <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-green-600" />
                <span className="font-semibold text-green-800 dark:text-green-200">
                  Winner: {results.winner}
                </span>
              </div>
              <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                {results.recommendation}
              </p>
            </div>
          )}

          {/* Confidence */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Confidence:</span>
            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  results.confidence >= 0.95 ? 'bg-green-500' :
                  results.confidence >= 0.8 ? 'bg-yellow-500' : 'bg-red-500'
                }`}
                style={{ width: `${results.confidence * 100}%` }}
              />
            </div>
            <span className="text-sm font-medium">{formatPercent(results.confidence)}</span>
          </div>

          {/* Variants comparison */}
          <div className="space-y-3">
            {results.variants.map(v => (
              <div
                key={v.id}
                className={`p-4 rounded-lg border ${
                  v.isWinner ? 'border-green-500 bg-green-50/50 dark:bg-green-900/10' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{v.name}</span>
                  {v.isWinner && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800">
                      Winner
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Spend</p>
                    <p className="font-medium">{formatCurrency(v.metrics.spend)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Conversions</p>
                    <p className="font-medium">{formatNumber(v.metrics.conversions)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">CPA</p>
                    <p className="font-medium">{formatCurrency(v.metrics.cpa)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Sample</p>
                    <p className="font-medium">{formatNumber(v.metrics.sampleSize)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-4">
            <Button onClick={onClose}>Close</Button>
          </div>
        </div>
      ) : (
        <p className="text-center text-muted-foreground py-8">
          No results available yet
        </p>
      )}
    </Modal>
  )
}
