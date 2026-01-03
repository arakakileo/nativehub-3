import { useState } from 'react'
import { motion } from 'framer-motion'
import { Ban, Plus, Trash2, Search } from 'lucide-react'
import { toast } from 'sonner'
import { DataTable } from '../components/ui/DataTable'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type BlacklistEntry } from '../lib/api'
import { getSourceColor } from '../lib/utils'

export function WidgetBlacklist() {
  const [search, setSearch] = useState('')
  const queryClient = useQueryClient()

  const { data: blacklist = [], isLoading } = useQuery({
    queryKey: ['widgetBlacklist'],
    queryFn: api.getBlacklist,
  })

  const addMutation = useMutation({
    mutationFn: (data: { widgetId: string; sourceId: string; reason?: string }) =>
      api.addToBlacklist(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['widgetBlacklist'] })
      toast.success('Widget added to blacklist')
    },
    onError: () => toast.error('Failed to add widget'),
  })

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.removeFromBlacklist(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['widgetBlacklist'] })
      toast.success('Widget removed from blacklist')
    },
    onError: () => toast.error('Failed to remove widget'),
  })

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    widgetId: '',
    sourceId: 'revcontent',
    reason: '',
  })

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    await addMutation.mutateAsync(form)
    setForm({ widgetId: '', sourceId: 'revcontent', reason: '' })
    setShowForm(false)
  }

  const filtered = blacklist.filter(
    (w: BlacklistEntry) =>
      w.widgetId.toLowerCase().includes(search.toLowerCase()) ||
      w.sourceId.toLowerCase().includes(search.toLowerCase())
  )

  const columns = [
    {
      key: 'widgetId',
      header: 'Widget ID',
      render: (w: BlacklistEntry) => (
        <div className="flex items-center gap-3">
          <Ban className="h-4 w-4 text-destructive" />
          <span className="font-mono">{w.widgetId}</span>
        </div>
      ),
    },
    {
      key: 'sourceId',
      header: 'Source',
      render: (w: BlacklistEntry) => (
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${getSourceColor(w.sourceId)}`} />
          <span className="capitalize">{w.sourceId}</span>
        </div>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (w: BlacklistEntry) => w.reason || '-',
    },
    {
      key: 'createdAt',
      header: 'Added',
      render: (w: BlacklistEntry) => new Date(w.createdAt).toLocaleDateString(),
    },
    {
      key: 'actions',
      header: '',
      render: (w: BlacklistEntry) => (
        <Button
          size="sm"
          variant="ghost"
          aria-label={`Remove widget ${w.widgetId} from blacklist`}
          onClick={() => {
            if (confirm('Remove from blacklist?')) removeMutation.mutate(w.id)
          }}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
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
            Widget Blacklist
          </motion.h1>
          <p className="text-muted-foreground">
            Manage blocked widgets across all sources
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4" />
          Add Widget
        </Button>
      </div>

      {/* Add Form */}
      {showForm && (
        <motion.form
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          onSubmit={handleAdd}
          className="rounded-xl border bg-card p-4"
        >
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Widget ID</label>
              <input
                type="text"
                value={form.widgetId}
                onChange={(e) => setForm({ ...form, widgetId: e.target.value })}
                placeholder="12345"
                className="w-full rounded-lg border bg-background px-3 py-2"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Source</label>
              <select
                value={form.sourceId}
                onChange={(e) => setForm({ ...form, sourceId: e.target.value })}
                className="w-full rounded-lg border bg-background px-3 py-2"
              >
                <option value="revcontent">Revcontent</option>
                <option value="taboola">Taboola</option>
                <option value="outbrain">Outbrain</option>
                <option value="mgid">MGID</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Reason (optional)</label>
              <input
                type="text"
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="Low quality traffic"
                className="w-full rounded-lg border bg-background px-3 py-2"
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" className="w-full" isLoading={addMutation.isPending}>
                Add to Blacklist
              </Button>
            </div>
          </div>
        </motion.form>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search widgets..."
          className="w-full rounded-lg border bg-background py-2 pl-10 pr-4"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {['revcontent', 'taboola', 'outbrain', 'mgid'].map((source) => (
          <div key={source} className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2">
              <span className={`h-3 w-3 rounded-full ${getSourceColor(source)}`} />
              <span className="text-sm font-medium capitalize">{source}</span>
            </div>
            <p className="mt-2 text-2xl font-bold">
              {blacklist.filter((w: BlacklistEntry) => w.sourceId === source).length}
            </p>
          </div>
        ))}
      </div>

      {/* Table or Empty State */}
      {!isLoading && blacklist.length === 0 ? (
        <EmptyState
          icon={Ban}
          title="No blacklisted widgets"
          description="Block underperforming publishers to improve campaign ROI"
          actionLabel="Add Widget"
          onAction={() => setShowForm(true)}
        />
      ) : (
        <DataTable
          data={filtered}
          columns={columns}
          keyField="id"
          isLoading={isLoading}
          emptyMessage="No widgets match your search."
        />
      )}
    </div>
  )
}
