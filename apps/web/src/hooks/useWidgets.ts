import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '../lib/api'

export function useCampaignWidgets(sourceAccountId: string, externalCampaignId: string) {
  return useQuery({
    queryKey: ['campaignWidgets', sourceAccountId, externalCampaignId],
    queryFn: () => api.getCampaignWidgets(sourceAccountId, externalCampaignId),
    enabled: !!sourceAccountId && !!externalCampaignId,
  })
}

export function useBlacklist() {
  return useQuery({
    queryKey: ['widgetBlacklist'],
    queryFn: api.getBlacklist,
  })
}

export function useAddToBlacklist() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: { widgetId: string; sourceId: string; reason?: string }) =>
      api.addToBlacklist(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['widgetBlacklist'] })
      queryClient.invalidateQueries({ queryKey: ['campaignWidgets'] })
      toast.success('Widget added to blacklist')
    },
    onError: () => toast.error('Failed to add widget to blacklist'),
  })
}

export function useRemoveFromBlacklist() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.removeFromBlacklist(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['widgetBlacklist'] })
      queryClient.invalidateQueries({ queryKey: ['campaignWidgets'] })
      toast.success('Widget removed from blacklist')
    },
    onError: () => toast.error('Failed to remove widget from blacklist'),
  })
}
