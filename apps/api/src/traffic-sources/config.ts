/**
 * Traffic source API configuration
 */
export const TRAFFIC_SOURCE_CONFIG = {
  revcontent: {
    baseUrl: 'https://api.revcontent.io/oauth/v1',
    rateLimit: { requests: 100, perSeconds: 60 },
    tokenRefreshBuffer: 300, // 5 min before expiry
  },
  taboola: {
    baseUrl: 'https://backstage.taboola.com/backstage/api/1.0',
    rateLimit: { requests: 60, perSeconds: 60 },
    tokenRefreshBuffer: 300,
  },
  outbrain: {
    baseUrl: 'https://api.outbrain.com/amplify/v0.1',
    rateLimit: { requests: 30, perSeconds: 1 },
    loginRateLimit: { requests: 2, perHour: 1 }, // Very strict!
    tokenValidityDays: 30,
  },
  mgid: {
    baseUrl: 'https://api.mgid.com/v1',
    rateLimit: { requests: 100, perSeconds: 60 },
  },
} as const

export type TrafficSourceId = keyof typeof TRAFFIC_SOURCE_CONFIG
