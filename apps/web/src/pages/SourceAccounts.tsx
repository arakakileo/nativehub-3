import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, RefreshCw, Trash2, X, Plug } from 'lucide-react'
import { DataTable } from '../components/ui/DataTable'
import { StatusBadge } from '../components/ui/StatusBadge'
import { Button } from '../components/ui/Button'
import {
  useSourceAccounts,
  useCreateSourceAccount,
  useTestSourceAccount,
  useDeleteSourceAccount,
  useSyncSourceAccount,
} from '../hooks/useSourceAccounts'
import { toast } from 'sonner'
import { getSourceColor } from '../lib/utils'
import type { SourceAccount, CreateSourceAccountInput } from '../lib/api'

const SOURCES = ['revcontent', 'taboola', 'outbrain', 'mgid'] as const

export function SourceAccounts() {
  const [showModal, setShowModal] = useState(false)
  const { data: accounts = [], isLoading } = useSourceAccounts()
  const createMutation = useCreateSourceAccount()
  const testMutation = useTestSourceAccount()
  const deleteMutation = useDeleteSourceAccount()
  const syncMutation = useSyncSourceAccount()

  const [form, setForm] = useState({
    sourceId: 'revcontent' as typeof SOURCES[number],
    name: '',
    credentials: {} as Record<string, string>,
  })

  // Field display names and their API mapping
  const credentialFields: Record<string, { display: string; apiField: string }[]> = {
    revcontent: [
      { display: 'Client ID', apiField: 'clientId' },
      { display: 'Client Secret', apiField: 'clientSecret' },
    ],
    taboola: [
      { display: 'Client ID', apiField: 'clientId' },
      { display: 'Client Secret', apiField: 'clientSecret' },
      { display: 'Account ID', apiField: 'accountId' },
    ],
    outbrain: [
      { display: 'OB Token (Access Token)', apiField: 'clientId' }, // Outbrain uses clientId for pre-obtained token
      { display: 'Marketer ID', apiField: 'accountId' },
    ],
    mgid: [
      { display: 'Client ID', apiField: 'clientId' },
      { display: 'Token', apiField: 'clientSecret' }, // MGID token maps to clientSecret
    ],
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // Flatten credentials into the request body (API expects flat structure)
    const payload: CreateSourceAccountInput = {
      sourceId: form.sourceId,
      name: form.name,
      clientId: form.credentials.clientId || '',
      clientSecret: form.credentials.clientSecret,
      accountId: form.credentials.accountId,
      username: form.credentials.username,
      password: form.credentials.password,
    }

    try {
      // Step 1: Create account
      const account = await createMutation.mutateAsync(payload)

      // Step 2: Auto-test connection
      try {
        await testMutation.mutateAsync(account.id)
        toast.success('Account connected successfully')
      } catch {
        toast.warning('Account created but connection test failed. Try syncing later.')
      }

      setShowModal(false)
      setForm({ sourceId: 'revcontent', name: '', credentials: {} })
    } catch {
      // Create failed - error already shown by mutation
    }
  }

  const handleTestConnection = async (accountId: string) => {
    try {
      await testMutation.mutateAsync(accountId)
      toast.success('Connection successful!')
    } catch {
      toast.error('Connection test failed')
    }
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
          {/* Test Connection button for pending accounts */}
          {acc.status === 'pending' && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleTestConnection(acc.id)}
              disabled={testMutation.isPending}
              title="Test Connection"
            >
              <Plug className={`h-4 w-4 ${testMutation.isPending ? 'animate-pulse' : ''}`} />
            </Button>
          )}
          {/* Sync button for connected accounts */}
          {acc.status === 'connected' && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => syncMutation.mutate(acc.id)}
              disabled={syncMutation.isPending}
              title="Sync Campaigns"
            >
              <RefreshCw className={`h-4 w-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (confirm('Delete this account?')) {
                deleteMutation.mutate(acc.id)
              }
            }}
            disabled={deleteMutation.isPending}
            title="Delete Account"
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
                  <div key={field.apiField}>
                    <label className="mb-1 block text-sm font-medium">
                      {field.display}
                    </label>
                    <input
                      type="password"
                      value={form.credentials[field.apiField] || ''}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          credentials: { ...form.credentials, [field.apiField]: e.target.value },
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
                  <Button
                    type="submit"
                    className="flex-1"
                    isLoading={createMutation.isPending || testMutation.isPending}
                  >
                    {createMutation.isPending
                      ? 'Creating...'
                      : testMutation.isPending
                        ? 'Testing connection...'
                        : 'Add Account'}
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
