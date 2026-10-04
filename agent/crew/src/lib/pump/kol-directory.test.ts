import { describe, expect, it } from 'vitest'
import { lookupKolDirectory, topKolDirectory } from './kol-directory'
import { resolveHandleWallet } from './resolve-wallet'

describe('kol directory', () => {
  it('lists top 10 by followers with wallets', () => {
    const top = topKolDirectory(10)
    expect(top).toHaveLength(10)
    expect(top[0].pump).toBe('slingoor')
    expect(top.every((r) => r.wallet.length >= 32)).toBe(true)
    for (let i = 1; i < top.length; i += 1) {
      expect(top[i - 1].followers).toBeGreaterThanOrEqual(top[i].followers)
    }
  })

  it('maps X alias slingoorio → slingoor wallet', () => {
    const row = lookupKolDirectory('@slingoorio')
    expect(row?.pump).toBe('slingoor')
    expect(row?.wallet).toBe('5YRgrP3mjGzrzirYYN5HAQH19cTYREYwGxW6XRJQUzij')
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
})

function viFetcherNever(): typeof fetch {
  return (async () => {
    throw new Error('network should not be called for directory hits')
  }) as unknown as typeof fetch
}
