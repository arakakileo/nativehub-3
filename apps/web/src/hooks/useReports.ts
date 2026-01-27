import { useQuery } from '@tanstack/react-query'
import { api, TrendAnalysis, ReportSummary, DailyStats } from '../lib/api'

/**
 * Hook to fetch trend analysis (WoW, MoM comparisons)
 */
export function useTrends() {
  return useQuery<TrendAnalysis>({
    queryKey: ['reports', 'trends'],
    queryFn: () => api.getReportTrends(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 10 * 60 * 1000, // Refresh every 10 minutes
  })
}

/**
 * Hook to fetch daily stats for the last N days
 */
export function useDailyStats(days: number = 7) {
  return useQuery<{ days: DailyStats[] }>({
    queryKey: ['reports', 'daily', days],
    queryFn: () => api.getReportDaily(days),
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Hook to fetch report summary for a period
 */
export function useReportSummary(from?: string, to?: string) {
  return useQuery<ReportSummary>({
    queryKey: ['reports', 'summary', from, to],
    queryFn: () => api.getReportSummary(from, to),
    staleTime: 5 * 60 * 1000,
  })
}
