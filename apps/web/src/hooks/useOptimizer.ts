import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type OptimizerRule } from '../lib/api'

export function useOptimizerRules() {
  return useQuery({
    queryKey: ['optimizerRules'],
    queryFn: api.getOptimizerRules,
  })
}

export function useCreateOptimizerRule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: Omit<OptimizerRule, 'id' | 'createdAt' | 'updatedAt'>) =>
      api.createOptimizerRule(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['optimizerRules'] })
    },
  })
}

export function useUpdateOptimizerRule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<OptimizerRule> }) =>
      api.updateOptimizerRule(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['optimizerRules'] })
    },
  })
}

export function useDeleteOptimizerRule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.deleteOptimizerRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['optimizerRules'] })
    },
  })
}

export function useOptimizerActions() {
  return useQuery({
    queryKey: ['optimizerActions'],
    queryFn: api.getOptimizerActions,
  })
}

export function useRunOptimizer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: api.runOptimizer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['optimizerActions'] })
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    },
  })
}
