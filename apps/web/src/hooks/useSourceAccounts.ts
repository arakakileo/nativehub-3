import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
    },
  })
}

export function useUpdateSourceAccount() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateSourceAccountInput> }) =>
      api.updateSourceAccount(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sourceAccounts'] })
    },
  })
}

export function useDeleteSourceAccount() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.deleteSourceAccount(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sourceAccounts'] })
    },
  })
}

export function useSyncSourceAccount() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.syncSourceAccount(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sourceAccounts'] })
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    },
  })
}
