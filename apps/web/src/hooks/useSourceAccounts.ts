import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, type CreateSourceAccountInput } from '../lib/api'

export function useSourceAccounts() {
  return useQuery({
    queryKey: ['sourceAccounts'],
    queryFn: api.getSourceAccounts,
  })
}

export function useSourceAccount(id: string) {
  return useQuery({
    queryKey: ['sourceAccounts', id],
    queryFn: () => api.getSourceAccount(id),
    enabled: !!id,
  })
}

export function useCreateSourceAccount() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateSourceAccountInput) => api.createSourceAccount(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sourceAccounts'] })
      // Toast handled by caller after test connection
    },
    onError: () => toast.error('Failed to create account'),
  })
}

export function useUpdateSourceAccount() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateSourceAccountInput> }) =>
      api.updateSourceAccount(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sourceAccounts'] })
      toast.success('Account updated')
    },
    onError: () => toast.error('Failed to update account'),
  })
}

export function useDeleteSourceAccount() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.deleteSourceAccount(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sourceAccounts'] })
      toast.success('Account deleted')
    },
    onError: () => toast.error('Failed to delete account'),
  })
}

export function useSyncSourceAccount() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.syncSourceAccount(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sourceAccounts'] })
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      toast.success('Sync started')
    },
    onError: () => toast.error('Sync failed'),
  })
}

export function useTestSourceAccount() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.testSourceAccount(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sourceAccounts'] })
    },
    // No toast here - caller handles messaging
  })
}
