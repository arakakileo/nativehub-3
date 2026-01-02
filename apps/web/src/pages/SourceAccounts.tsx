import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { DataTable } from '../components/ui/DataTable'
import { StatusBadge } from '../components/ui/StatusBadge'
import { Button } from '../components/ui/Button'
import {
  useSourceAccounts,
  useCreateSourceAccount,
  useDeleteSourceAccount,
  useSyncSourceAccount,
} from '../hooks/useSourceAccounts'
import { getSourceColor } from '../lib/utils'
import type { SourceAccount } from '../lib/api'

const SOURCES = ['revcontent', 'taboola', 'outbrain', 'mgid'] as const

export function SourceAccounts() {
  const [showModal, setShowModal] = useState(false)
  const { data: accounts = [], isLoading } = useSourceAccounts()
  const createMutation = useCreateSourceAccount()
  const deleteMutation = useDeleteSourceAccount()
  const syncMutation = useSyncSourceAccount()

  const [form, setForm] = useState({
    sourceId: 'revcontent' as typeof SOURCES[number],
    name: '',
    credentials: {} as Record<string, string>,
  })

  const credentialFields: Record<string, string[]> = {
    revcontent: ['clientId', 'clientSecret'],
    taboola: ['clientId', 'clientSecret', 'accountId'],
    outbrain: ['accessToken', 'accountId'],
    mgid: ['clientId', 'token'],
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await createMutation.mutateAsync(form)
    setShowModal(false)
    setForm({ sourceId: 'revcontent', name: '', credentials: {} })
  }

  const columns = [
    {
      key: 'name',
      header: 'Account Name',
      render: (acc: SourceAccount) => (
        <div className="flex items-center gap-3">
          <span className={`h-3 w-3 rounded-full ${getSourceColor(acc.sourceId)}`} />
          <span className="font-medium">{acc.name}</span>
        </div>
      ),
    },
    {
      key: 'sourceId',
      header: 'Source',
      render: (acc: SourceAccount) => <span className="capitalize">{acc.sourceId}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (acc: SourceAccount) => <StatusBadge status={acc.status} />,
    },
    {
      key: 'lastSyncAt',
      header: 'Last Sync',
      render: (acc: SourceAccount) =>
        acc.lastSyncAt
          ? new Date(acc.lastSyncAt).toLocaleString()
          : 'Never',
    },
    {
      key: 'actions',
      header: '',
      render: (acc: SourceAccount) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => syncMutation.mutate(acc.id)}
            disabled={syncMutation.isPending}
          >
            <RefreshCw className={`h-4 w-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (confirm('Delete this account?')) {
                deleteMutation.mutate(acc.id)
              }
            }}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
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
            Source Accounts
          </motion.h1>
          <p className="text-muted-foreground">
            Manage your traffic source connections
          </p>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="h-4 w-4" />
          Add Account
        </Button>
      </div>

      {/* Table */}
      <DataTable
        data={accounts}
        columns={columns}
        keyField="id"
        isLoading={isLoading}
        emptyMessage="No accounts connected yet."
      />

      {/* Add Account Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setShowModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md rounded-xl bg-card p-6 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Add Source Account</h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="rounded-lg p-1 hover:bg-muted"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium">Source</label>
                  <select
                    value={form.sourceId}
                    onChange={(e) => setForm({ ...form, sourceId: e.target.value as typeof SOURCES[number], credentials: {} })}
                    className="w-full rounded-lg border bg-background px-3 py-2"
                  >
                    {SOURCES.map((s) => (
                      <option key={s} value={s}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium">Account Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="My Revcontent Account"
                    className="w-full rounded-lg border bg-background px-3 py-2"
                    required
                  />
                </div>

                {credentialFields[form.sourceId].map((field) => (
                  <div key={field}>
                    <label className="mb-1 block text-sm font-medium capitalize">
                      {field.replace(/([A-Z])/g, ' $1').trim()}
                    </label>
                    <input
                      type="password"
                      value={form.credentials[field] || ''}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          credentials: { ...form.credentials, [field]: e.target.value },
                        })
                      }
                      className="w-full rounded-lg border bg-background px-3 py-2"
                      required
                    />
                  </div>
                ))}

                <div className="flex gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setShowModal(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1" isLoading={createMutation.isPending}>
                    Add Account
                  </Button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
