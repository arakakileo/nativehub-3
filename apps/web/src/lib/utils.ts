import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value)
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

export function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`
}

export function getSourceColor(sourceId: string): string {
  const colors: Record<string, string> = {
    revcontent: 'bg-blue-500',
    taboola: 'bg-orange-500',
    outbrain: 'bg-purple-500',
    mgid: 'bg-green-500',
  }
  return colors[sourceId] || 'bg-gray-500'
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    connected: 'bg-green-500',
    active: 'bg-green-500',
    pending: 'bg-yellow-500',
    paused: 'bg-yellow-500',
    error: 'bg-red-500',
    revoked: 'bg-red-500',
    deleted: 'bg-gray-500',
  }
  return colors[status] || 'bg-gray-500'
}
