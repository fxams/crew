import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DISABLED_SUI_LAUNCHPAD_CONFIG,
  fetchSuiLaunchpadConfig,
  fetchSuiPools,
  suiLaunchpadApiBasePublic,
} from './sui-api'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('fetchSuiLaunchpadConfig', () => {
  it('returns disabled config on HTTP 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }) as Response),
    )
    const cfg = await fetchSuiLaunchpadConfig()
    expect(cfg.enabled).toBe(false)
    expect(cfg.network).toBe('testnet')
  })

  it('merges enabled config from API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        ({
          ok: true,
          json: async () => ({
            enabled: true,
            network: 'testnet',
            launchpadBackend: 'crewpay',
            packageId: '0xabc',
            publishedAt: null,
            configId: '0xdef',
            graphqlUrl: 'https://graphql.test',
            explorer: 'suiscan',
            tradeFeeBps: 120,
            nearGraduationProgressBps: 7000,
          }),
        }) as Response,
      ),
    )
    const cfg = await fetchSuiLaunchpadConfig()
    expect(cfg.enabled).toBe(true)
    expect(cfg.packageId).toBe('0xabc')
  })

  it('returns disabled config on network error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('timeout'))))
    const cfg = await fetchSuiLaunchpadConfig()
    expect(cfg).toEqual({ ...DISABLED_SUI_LAUNCHPAD_CONFIG })
  })
})

describe('fetchSuiPools', () => {
  it('returns empty array when pools endpoint fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }) as Response),
    )
    expect(await fetchSuiPools()).toEqual([])
  })
})

describe('suiLaunchpadApiBasePublic', () => {
  it('documents production API host', () => {
    expect(suiLaunchpadApiBasePublic()).toBe('https://api.crewpay.dev')
  })
})
