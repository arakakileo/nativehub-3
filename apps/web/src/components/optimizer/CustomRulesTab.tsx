import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Plus,
  Play,
  Pause,
  Copy,
  Trash2,
  FileText,
  Zap,
} from 'lucide-react'
import { Button } from '../ui/Button'
import { DataTable } from '../ui/DataTable'
import { StatusBadge } from '../ui/StatusBadge'
import { Modal } from '../ui/Modal'
import {
  useCustomRules,
  useCreateCustomRule,
  useActivateCustomRule,
  usePauseCustomRule,
  useCloneCustomRule,
  useDeleteCustomRule,
  useRuleTemplates,
} from '../../hooks/useAdvancedOptimizer'
import { useSourceAccounts } from '../../hooks/useSourceAccounts'
import { formatDistanceToNow } from 'date-fns'
import { formatNumber } from '../../lib/utils'
import type {
  CustomRule,
  RuleCondition,
  RuleAction,
  RuleConditionMetric,
  RuleConditionOperator,
  RuleActionType,
} from '../../lib/api'

const metricLabels: Record<RuleConditionMetric, string> = {
  spend: 'Spend',
  cpa: 'CPA',
  conversions: 'Conversions',
  clicks: 'Clicks',
  impressions: 'Impressions',
  ctr: 'CTR',
  roas: 'ROAS',
}

const operatorLabels: Record<RuleConditionOperator, string> = {
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  eq: '=',
  neq: '!=',
  between: 'between',
}

const actionLabels: Record<RuleActionType, string> = {
  pause: 'Pause Campaign',
  enable: 'Enable Campaign',
  adjust_bid: 'Adjust Bid',
  notify: 'Send Notification',
  tag: 'Add Tag',
}

export function CustomRulesTab() {
  const { data: rulesData, isLoading } = useCustomRules()
  const { data: templatesData } = useRuleTemplates()
  const { data: accounts = [] } = useSourceAccounts()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showTemplatesModal, setShowTemplatesModal] = useState(false)

  const activateRule = useActivateCustomRule()
  const pauseRule = usePauseCustomRule()
  const cloneRule = useCloneCustomRule()
  const deleteRule = useDeleteCustomRule()

  const rules = rulesData?.rules ?? []
  const templates = templatesData?.templates ?? []

  const statusMap: Record<string, 'active' | 'paused' | 'pending'> = {
    active: 'active',
    paused: 'paused',
    draft: 'pending',
  }

  const columns = [
    {
      key: 'name',
      header: 'Rule',
      render: (r: CustomRule) => (
        <div>
          <span className="font-medium">{r.name}</span>
          {r.description && (
            <p className="text-sm text-muted-foreground line-clamp-1">{r.description}</p>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r: CustomRule) => <StatusBadge status={statusMap[r.status]} />,
    },
    {
      key: 'conditions',
      header: 'Conditions',
      render: (r: CustomRule) => (
        <div className="flex items-center gap-1">
          <span>{r.conditionCount}</span>
          <span className="text-xs text-muted-foreground">({r.conditionLogic.toUpperCase()})</span>
        </div>
      ),
      className: 'text-center',
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (r: CustomRule) => r.actionCount,
      className: 'text-center',
    },
    {
      key: 'stats',
      header: 'Triggered',
      render: (r: CustomRule) => (
        <div className="text-sm">
          <span className="font-medium">{formatNumber(r.stats.timesTriggered)}</span>
          {r.stats.lastTriggeredAt && (
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(r.stats.lastTriggeredAt), { addSuffix: true })}
            </p>
          )}
        </div>
      ),
      className: 'text-right',
    },
    {
      key: 'priority',
      header: 'Priority',
      render: (r: CustomRule) => r.priority,
      className: 'text-center',
    },
    {
      key: 'actionsMenu',
      header: '',
      render: (r: CustomRule) => (
        <div className="flex items-center gap-1">
          {r.status === 'draft' || r.status === 'paused' ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => activateRule.mutate(r.id)}
              disabled={activateRule.isPending}
              title="Activate"
            >
              <Play className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => pauseRule.mutate(r.id)}
              disabled={pauseRule.isPending}
              title="Pause"
            >
              <Pause className="h-4 w-4" />
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              const name = prompt('New rule name:', `${r.name} (Copy)`)
              if (name) cloneRule.mutate({ id: r.id, name })
            }}
            disabled={cloneRule.isPending}
            title="Clone"
          >
            <Copy className="h-4 w-4" />
          </Button>
          {r.status !== 'active' && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => deleteRule.mutate(r.id)}
              disabled={deleteRule.isPending}
              className="text-red-600 hover:text-red-700"
              title="Delete"
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
          <h2 className="text-lg font-semibold">Custom Automation Rules</h2>
          <p className="text-sm text-muted-foreground">
            Create rules to automatically optimize your campaigns
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowTemplatesModal(true)}>
            <FileText className="h-4 w-4" />
            Templates
          </Button>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4" />
            New Rule
          </Button>
        </div>
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
              <p className="text-sm text-muted-foreground">Active</p>
              <p className="text-2xl font-bold">
                {rules.filter(r => r.status === 'active').length}
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
              <Pause className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Paused</p>
              <p className="text-2xl font-bold">
                {rules.filter(r => r.status === 'paused').length}
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
              <Zap className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Actions</p>
              <p className="text-2xl font-bold">
                {formatNumber(rules.reduce((sum, r) => sum + r.stats.actionsExecuted, 0))}
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Rules Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <DataTable
          data={rules}
          columns={columns}
          keyField="id"
          isLoading={isLoading}
          emptyMessage="No rules yet. Create one or use a template to get started."
        />
      </motion.div>

      {/* Create Rule Modal */}
      <CreateRuleModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        accounts={accounts}
      />

      {/* Templates Modal */}
      <TemplatesModal
        isOpen={showTemplatesModal}
        onClose={() => setShowTemplatesModal(false)}
        templates={templates}
        accounts={accounts}
      />
    </div>
  )
}

function CreateRuleModal({
  isOpen,
  onClose,
  accounts,
}: {
  isOpen: boolean
  onClose: () => void
  accounts: Array<{ id: string; name: string; sourceId: string }>
}) {
  const createRule = useCreateCustomRule()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [sourceAccountId, setSourceAccountId] = useState('')
  const [conditionLogic, setConditionLogic] = useState<'and' | 'or'>('and')
  const [conditions, setConditions] = useState<Omit<RuleCondition, 'id'>[]>([
    { metric: 'cpa', operator: 'gt', value: 50, timeframe: 'last_7_days' },
  ])
  const [actions, setActions] = useState<Omit<RuleAction, 'id'>[]>([
    { type: 'pause', params: {} },
  ])

  const handleSubmit = () => {
    createRule.mutate({
      name,
      description,
      sourceAccountId,
      conditionLogic,
      conditions,
      actions,
    })
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Custom Rule">
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
        <div>
          <label className="block text-sm font-medium mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full h-10 rounded-lg border bg-background px-3 text-sm"
            placeholder="e.g., Pause High CPA Campaigns"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            rows={2}
            placeholder="What does this rule do?"
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

        {/* Conditions */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium">Conditions</label>
            <select
              value={conditionLogic}
              onChange={(e) => setConditionLogic(e.target.value as 'and' | 'or')}
              className="h-8 rounded border bg-background px-2 text-xs"
            >
              <option value="and">ALL (AND)</option>
              <option value="or">ANY (OR)</option>
            </select>
          </div>
          <div className="space-y-2">
            {conditions.map((c, i) => (
              <div key={i} className="flex gap-2 items-center p-2 rounded-lg bg-muted/50">
                <select
                  value={c.metric}
                  onChange={(e) => {
                    const newConditions = [...conditions]
                    newConditions[i].metric = e.target.value as RuleConditionMetric
                    setConditions(newConditions)
                  }}
                  className="h-8 rounded border bg-background px-2 text-sm flex-1"
                >
                  {Object.entries(metricLabels).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
                <select
                  value={c.operator}
                  onChange={(e) => {
                    const newConditions = [...conditions]
                    newConditions[i].operator = e.target.value as RuleConditionOperator
                    setConditions(newConditions)
                  }}
                  className="h-8 rounded border bg-background px-2 text-sm w-20"
                >
                  {Object.entries(operatorLabels).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
                <input
                  type="number"
                  value={c.value}
                  onChange={(e) => {
                    const newConditions = [...conditions]
                    newConditions[i].value = Number(e.target.value)
                    setConditions(newConditions)
                  }}
                  className="h-8 rounded border bg-background px-2 text-sm w-20"
                />
                <select
                  value={c.timeframe}
                  onChange={(e) => {
                    const newConditions = [...conditions]
                    newConditions[i].timeframe = e.target.value as RuleCondition['timeframe']
                    setConditions(newConditions)
                  }}
                  className="h-8 rounded border bg-background px-2 text-sm"
                >
                  <option value="today">Today</option>
                  <option value="yesterday">Yesterday</option>
                  <option value="last_3_days">Last 3 days</option>
                  <option value="last_7_days">Last 7 days</option>
                  <option value="last_14_days">Last 14 days</option>
                  <option value="last_30_days">Last 30 days</option>
                </select>
                {conditions.length > 1 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConditions(conditions.filter((_, j) => j !== i))}
                    className="text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConditions([...conditions, { metric: 'spend', operator: 'gt', value: 100, timeframe: 'last_7_days' }])}
            >
              <Plus className="h-4 w-4" />
              Add Condition
            </Button>
          </div>
        </div>

        {/* Actions */}
        <div>
          <label className="block text-sm font-medium mb-2">Actions</label>
          <div className="space-y-2">
            {actions.map((a, i) => (
              <div key={i} className="flex gap-2 items-center p-2 rounded-lg bg-muted/50">
                <select
                  value={a.type}
                  onChange={(e) => {
                    const newActions = [...actions]
                    newActions[i].type = e.target.value as RuleActionType
                    newActions[i].params = {}
                    setActions(newActions)
                  }}
                  className="h-8 rounded border bg-background px-2 text-sm flex-1"
                >
                  {Object.entries(actionLabels).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
                {a.type === 'adjust_bid' && (
                  <input
                    type="number"
                    value={a.params.bidChangePercent ?? 0}
                    onChange={(e) => {
                      const newActions = [...actions]
                      newActions[i].params.bidChangePercent = Number(e.target.value)
                      setActions(newActions)
                    }}
                    className="h-8 rounded border bg-background px-2 text-sm w-20"
                    placeholder="%"
                  />
                )}
                {a.type === 'notify' && (
                  <input
                    type="text"
                    value={a.params.notificationMessage ?? ''}
                    onChange={(e) => {
                      const newActions = [...actions]
                      newActions[i].params.notificationMessage = e.target.value
                      setActions(newActions)
                    }}
                    className="h-8 rounded border bg-background px-2 text-sm flex-1"
                    placeholder="Message"
                  />
                )}
                {actions.length > 1 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setActions(actions.filter((_, j) => j !== i))}
                    className="text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setActions([...actions, { type: 'notify', params: {} }])}
            >
              <Plus className="h-4 w-4" />
              Add Action
            </Button>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!name || !sourceAccountId || createRule.isPending}
            isLoading={createRule.isPending}
          >
            Create Rule
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function TemplatesModal({
  isOpen,
  onClose,
  templates,
  accounts,
}: {
  isOpen: boolean
  onClose: () => void
  templates: Array<{
    id: string
    name: string
    description: string
    conditions: Omit<RuleCondition, 'id'>[]
    actions: Omit<RuleAction, 'id'>[]
  }>
  accounts: Array<{ id: string; name: string; sourceId: string }>
}) {
  const createRule = useCreateCustomRule()
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [sourceAccountId, setSourceAccountId] = useState('')

  const handleUseTemplate = () => {
    const template = templates.find(t => t.id === selectedTemplate)
    if (!template || !sourceAccountId) return

    createRule.mutate({
      name: template.name,
      description: template.description,
      sourceAccountId,
      conditions: template.conditions,
      actions: template.actions,
    })
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Rule Templates">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Select Account</label>
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

        <div className="space-y-2">
          {templates.map(t => (
            <div
              key={t.id}
              onClick={() => setSelectedTemplate(t.id)}
              className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                selectedTemplate === t.id
                  ? 'border-primary bg-primary/5'
                  : 'hover:bg-muted/50'
              }`}
            >
              <h3 className="font-medium">{t.name}</h3>
              <p className="text-sm text-muted-foreground">{t.description}</p>
              <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                <span>{t.conditions.length} conditions</span>
                <span>{t.actions.length} actions</span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleUseTemplate}
            disabled={!selectedTemplate || !sourceAccountId || createRule.isPending}
            isLoading={createRule.isPending}
          >
            Use Template
          </Button>
        </div>
      </div>
    </Modal>
  )
}
