import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  api,
  type OptimizerRule,
  type CreateOptimizerCampaignInput,
  type UpdateOptimizerCampaignInput,
} from '../lib/api'

// === OPTIMIZER CAMPAIGNS ===

export function useOptimizerCampaigns() {
  return useQuery({
    queryKey: ['optimizerCampaigns'],
    queryFn: api.getOptimizerCampaigns,
  })
}

export function useOptimizerCampaign(id: string) {
  return useQuery({
    queryKey: ['optimizerCampaign', id],
    queryFn: () => api.getOptimizerCampaign(id),
    enabled: !!id,
  })
}

export function useCreateOptimizerCampaign() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateOptimizerCampaignInput) =>
      api.createOptimizerCampaign(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['optimizerCampaigns'] })
      toast.success('Optimizer campaign created')
    },
    onError: () => toast.error('Failed to create optimizer campaign'),
  })
}

export function useUpdateOptimizerCampaign() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateOptimizerCampaignInput }) =>
      api.updateOptimizerCampaign(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['optimizerCampaigns'] })
      queryClient.invalidateQueries({ queryKey: ['optimizerCampaign', id] })
      toast.success('Optimizer campaign updated')
    },
    onError: () => toast.error('Failed to update optimizer campaign'),
  })
}

export function useRunOptimizerCampaign() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.runOptimizerCampaign(id),
    onSuccess: (result, id) => {
      queryClient.invalidateQueries({ queryKey: ['optimizerCampaign', id] })
      queryClient.invalidateQueries({ queryKey: ['optimizerCampaignActions', id] })
      if (result.skipped) {
        toast.info('Optimization skipped (campaign disabled)')
      } else {
        toast.success(`Optimization complete: ${result.actionsExecuted} actions executed`)
      }
    },
    onError: () => toast.error('Optimization failed'),
  })
}

export function useOptimizerCampaignActions(id: string, limit?: number) {
  return useQuery({
    queryKey: ['optimizerCampaignActions', id, limit],
    queryFn: () => api.getOptimizerCampaignActions(id, limit),
    enabled: !!id,
  })
}

// === OPTIMIZER STATUS ===

export function useOptimizerStatus() {
  return useQuery({
    queryKey: ['optimizerStatus'],
    queryFn: api.getOptimizerStatus,
    refetchInterval: 30000, // Refresh every 30 seconds
  })
}

// === OPTIMIZER RULES (legacy - global rules) ===

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
      toast.success('Rule created')
    },
    onError: () => toast.error('Failed to create rule'),
  })
}

export function useUpdateOptimizerRule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<OptimizerRule> }) =>
      api.updateOptimizerRule(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['optimizerRules'] })
      toast.success('Rule updated')
    },
    onError: () => toast.error('Failed to update rule'),
  })
}

export function useDeleteOptimizerRule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.deleteOptimizerRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['optimizerRules'] })
      toast.success('Rule deleted')
    },
    onError: () => toast.error('Failed to delete rule'),
  })
}

// === OPTIMIZER ACTIONS (legacy - global actions) ===

export function useOptimizerActions() {
  return useQuery({
    queryKey: ['optimizerActions'],
    queryFn: api.getOptimizerActions,
  })
}

// === RUN ALL ===

export function useRunOptimizer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: api.runOptimizer,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['optimizerCampaigns'] })
      queryClient.invalidateQueries({ queryKey: ['optimizerActions'] })
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      toast.success(`Optimizer complete: ${result.campaignsProcessed} campaigns, ${result.actionsCount} actions`)
    },
    onError: () => toast.error('Optimizer run failed'),
  })
}
