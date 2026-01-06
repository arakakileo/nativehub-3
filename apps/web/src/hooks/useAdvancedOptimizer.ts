/**
 * React Query hooks for Phase 5 Advanced Optimizer features:
 * - Bid Recommendations
 * - Anomaly Detection
 * - A/B Testing Experiments
 * - Custom Automation Rules
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  api,
  type GetRecommendationsInput,
  type CreateExperimentInput,
  type CreateCustomRuleInput,
  type UpdateCustomRuleInput,
  type ValidateRuleInput,
  type RuleStatus,
} from '../lib/api'

// === BID RECOMMENDATIONS ===

export function useRecommendations(campaignId: string, params: GetRecommendationsInput) {
  return useQuery({
    queryKey: ['recommendations', campaignId, params],
    queryFn: () => api.getRecommendations(campaignId, params),
    enabled: !!campaignId && !!params.sourceAccountId,
  })
}

export function useBulkRecommendations(params: GetRecommendationsInput) {
  return useQuery({
    queryKey: ['bulkRecommendations', params],
    queryFn: () => api.getBulkRecommendations(params),
    enabled: !!params.sourceAccountId,
  })
}

// === ANOMALY DETECTION ===

export function useAnomalies() {
  return useQuery({
    queryKey: ['anomalies'],
    queryFn: api.getAnomalies,
    refetchInterval: 60000, // Refresh every minute
  })
}

export function useAccountAnomalies(sourceAccountId: string) {
  return useQuery({
    queryKey: ['anomalies', sourceAccountId],
    queryFn: () => api.getAccountAnomalies(sourceAccountId),
    enabled: !!sourceAccountId,
    refetchInterval: 60000,
  })
}

export function useSendAnomalyAlerts() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (sourceAccountId: string) => api.sendAnomalyAlerts(sourceAccountId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['anomalies'] })
      if (result.alertsSent > 0) {
        toast.success(`${result.alertsSent} alerts sent`)
      } else {
        toast.info('No critical anomalies to alert')
      }
    },
    onError: () => toast.error('Failed to send alerts'),
  })
}

// === A/B TESTING EXPERIMENTS ===

export function useExperiments() {
  return useQuery({
    queryKey: ['experiments'],
    queryFn: api.getExperiments,
  })
}

export function useExperiment(id: string) {
  return useQuery({
    queryKey: ['experiment', id],
    queryFn: () => api.getExperiment(id),
    enabled: !!id,
  })
}

export function useCreateExperiment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateExperimentInput) => api.createExperiment(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['experiments'] })
      toast.success('Experiment created')
    },
    onError: () => toast.error('Failed to create experiment'),
  })
}

export function useStartExperiment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.startExperiment(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['experiments'] })
      queryClient.invalidateQueries({ queryKey: ['experiment', id] })
      toast.success('Experiment started')
    },
    onError: () => toast.error('Failed to start experiment'),
  })
}

export function usePauseExperiment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.pauseExperiment(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['experiments'] })
      queryClient.invalidateQueries({ queryKey: ['experiment', id] })
      toast.success('Experiment paused')
    },
    onError: () => toast.error('Failed to pause experiment'),
  })
}

export function useStopExperiment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.stopExperiment(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['experiments'] })
      queryClient.invalidateQueries({ queryKey: ['experiment', id] })
      toast.success('Experiment stopped')
    },
    onError: () => toast.error('Failed to stop experiment'),
  })
}

export function useExperimentResults(id: string) {
  return useQuery({
    queryKey: ['experimentResults', id],
    queryFn: () => api.getExperimentResults(id),
    enabled: !!id,
  })
}

export function useDeleteExperiment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.deleteExperiment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['experiments'] })
      toast.success('Experiment deleted')
    },
    onError: () => toast.error('Failed to delete experiment'),
  })
}

// === CUSTOM AUTOMATION RULES ===

export function useCustomRules(status?: RuleStatus) {
  return useQuery({
    queryKey: ['customRules', status],
    queryFn: () => api.getCustomRules(status),
  })
}

export function useCustomRule(id: string) {
  return useQuery({
    queryKey: ['customRule', id],
    queryFn: () => api.getCustomRule(id),
    enabled: !!id,
  })
}

export function useCreateCustomRule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateCustomRuleInput) => api.createCustomRule(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customRules'] })
      toast.success('Rule created')
    },
    onError: () => toast.error('Failed to create rule'),
  })
}

export function useUpdateCustomRule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCustomRuleInput }) =>
      api.updateCustomRule(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['customRules'] })
      queryClient.invalidateQueries({ queryKey: ['customRule', id] })
      toast.success('Rule updated')
    },
    onError: () => toast.error('Failed to update rule'),
  })
}

export function useActivateCustomRule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.activateCustomRule(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['customRules'] })
      queryClient.invalidateQueries({ queryKey: ['customRule', id] })
      toast.success('Rule activated')
    },
    onError: () => toast.error('Failed to activate rule'),
  })
}

export function usePauseCustomRule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.pauseCustomRule(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['customRules'] })
      queryClient.invalidateQueries({ queryKey: ['customRule', id] })
      toast.success('Rule paused')
    },
    onError: () => toast.error('Failed to pause rule'),
  })
}

export function useCloneCustomRule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.cloneCustomRule(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customRules'] })
      toast.success('Rule cloned')
    },
    onError: () => toast.error('Failed to clone rule'),
  })
}

export function useDeleteCustomRule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.deleteCustomRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customRules'] })
      toast.success('Rule deleted')
    },
    onError: () => toast.error('Failed to delete rule'),
  })
}

export function useValidateCustomRule() {
  return useMutation({
    mutationFn: (data: ValidateRuleInput) => api.validateCustomRule(data),
  })
}

export function useRuleTemplates() {
  return useQuery({
    queryKey: ['ruleTemplates'],
    queryFn: api.getRuleTemplates,
  })
}
