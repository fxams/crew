import { describe, expect, it } from 'vitest'
import {
  kolDbSize,
  lookupKolDirectory,
  topKolDirectory,
  topKolRecords,
} from './kol-directory'
import { resolveHandleWallet } from './resolve-wallet'

describe('kol directory', () => {
  it('ships at least 500 Pump wallets ranked by followers', () => {
    expect(kolDbSize()).toBeGreaterThanOrEqual(500)
    const top = topKolDirectory(10)
    expect(top).toHaveLength(10)
    expect(top.every((r) => r.wallet.length >= 32)).toBe(true)
    for (let i = 1; i < top.length; i += 1) {
      expect(top[i - 1].followers).toBeGreaterThanOrEqual(top[i].followers)
    }
  })

  it('includes slingoor + X alias with wallet', () => {
    const row = lookupKolDirectory('@slingoorio')
    expect(row?.pump.toLowerCase()).toBe('slingoor')
    expect(row?.wallet).toBe('5YRgrP3mjGzrzirYYN5HAQH19cTYREYwGxW6XRJQUzij')
  })

  it('resolves mid-rank accounts from the DB (not only top 10)', () => {
    const mid = topKolRecords(500)[250]
    expect(mid).toBeTruthy()
    const hit = lookupKolDirectory(mid.pump)
    expect(hit?.wallet).toBe(mid.wallet)
  })
})

describe('resolveHandleWallet + directory', () => {
  it('resolves @slingoor without network', async () => {
    const fetcher = viFetcherNever()
    const out = await resolveHandleWallet('@slingoor', { fetcher })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.wallet).toBe('5YRgrP3mjGzrzirYYN5HAQH19cTYREYwGxW6XRJQUzij')
    expect(out.xUsername?.toLowerCase()).toBe('slingoorio')
  })

  it('resolves @slingoorio alias without network', async () => {
    const out = await resolveHandleWallet('slingoorio', { fetcher: viFetcherNever() })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.wallet).toBe('5YRgrP3mjGzrzirYYN5HAQH19cTYREYwGxW6XRJQUzij')
    expect(out.xVerified).toBe(true)
  })

  it('resolves rank-100 account without network', async () => {
    const row = topKolRecords(100)[99]
    const out = await resolveHandleWallet(`@${row.pump}`, { fetcher: viFetcherNever() })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.wallet).toBe(row.wallet)
  })
})

function viFetcherNever(): typeof fetch {
  return (async () => {
    throw new Error('network should not be called for directory hits')
  }) as unknown as typeof fetch
}
