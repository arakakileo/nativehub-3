import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Zap,
  TrendingUp,
  AlertTriangle,
  FlaskConical,
  ListChecks,
  Play,
  RefreshCw,
  Settings,
} from 'lucide-react'
import { MetricCard } from '../components/ui/MetricCard'
import { Button } from '../components/ui/Button'
import { MetricGridSkeleton } from '../components/ui/Skeleton'
import { useOptimizerStatus, useRunOptimizer } from '../hooks/useOptimizer'
import { useAnomalies } from '../hooks/useAdvancedOptimizer'
import { useCustomRules } from '../hooks/useAdvancedOptimizer'
import { useExperiments } from '../hooks/useAdvancedOptimizer'

// Tab components
import { OptimizerOverviewTab } from '../components/optimizer/OptimizerOverviewTab'
import { RecommendationsTab } from '../components/optimizer/RecommendationsTab'
import { AnomaliesTab } from '../components/optimizer/AnomaliesTab'
import { ExperimentsTab } from '../components/optimizer/ExperimentsTab'
import { CustomRulesTab } from '../components/optimizer/CustomRulesTab'

type TabId = 'overview' | 'recommendations' | 'anomalies' | 'experiments' | 'rules'

const tabs: Array<{ id: TabId; label: string; icon: typeof Zap }> = [
  { id: 'overview', label: 'Overview', icon: Settings },
  { id: 'recommendations', label: 'Recommendations', icon: TrendingUp },
  { id: 'anomalies', label: 'Anomalies', icon: AlertTriangle },
  { id: 'experiments', label: 'Experiments', icon: FlaskConical },
  { id: 'rules', label: 'Custom Rules', icon: ListChecks },
]

export function OptimizerDashboard() {
  const [activeTab, setActiveTab] = useState<TabId>('overview')

  const { data: status, isLoading: statusLoading, refetch: refetchStatus } = useOptimizerStatus()
  const { data: anomaliesData } = useAnomalies()
  const { data: rulesData } = useCustomRules()
  const { data: experimentsData } = useExperiments()

  const runOptimizer = useRunOptimizer()

  const activeRules = rulesData?.rules?.filter(r => r.status === 'active').length ?? 0
  const criticalAnomalies = anomaliesData?.summary?.critical ?? 0
  const runningExperiments = experimentsData?.experiments?.filter(e => e.status === 'running').length ?? 0
  const queuePending = status?.queue?.pending ?? 0

  const handleRunOptimizer = () => {
    runOptimizer.mutate()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <motion.h1
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-2xl font-bold flex items-center gap-2"
          >
            <Zap className="h-6 w-6 text-yellow-500" />
            Optimizer
          </motion.h1>
          <p className="text-muted-foreground">
            Intelligent campaign optimization with AI-powered recommendations
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => refetchStatus()} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button
            onClick={handleRunOptimizer}
            disabled={runOptimizer.isPending}
            isLoading={runOptimizer.isPending}
          >
            <Play className="h-4 w-4" />
            Run Now
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      {statusLoading ? (
        <MetricGridSkeleton />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Active Rules"
            value={activeRules}
            format="number"
            icon={ListChecks}
            iconColor="text-blue-600"
          />
          <MetricCard
            title="Critical Anomalies"
            value={criticalAnomalies}
            format="number"
            icon={AlertTriangle}
            iconColor={criticalAnomalies > 0 ? "text-red-600" : "text-green-600"}
          />
          <MetricCard
            title="Running Experiments"
            value={runningExperiments}
            format="number"
            icon={FlaskConical}
            iconColor="text-purple-600"
          />
          <MetricCard
            title="Queue Pending"
            value={queuePending}
            format="number"
            icon={Zap}
            iconColor="text-yellow-600"
          />
        </div>
      )}

      {/* Tabs */}
      <div className="border-b">
        <nav className="flex gap-4" aria-label="Tabs">
          {tabs.map(tab => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors
                  ${isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted'}
                `}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                {tab.id === 'anomalies' && criticalAnomalies > 0 && (
                  <span className="ml-1 rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">
                    {criticalAnomalies}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {activeTab === 'overview' && <OptimizerOverviewTab />}
        {activeTab === 'recommendations' && <RecommendationsTab />}
        {activeTab === 'anomalies' && <AnomaliesTab />}
        {activeTab === 'experiments' && <ExperimentsTab />}
        {activeTab === 'rules' && <CustomRulesTab />}
      </motion.div>
    </div>
  )
}
