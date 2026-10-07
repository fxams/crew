import { describe, expect, it } from 'vitest'
import { DEFAULT_RPC_CANDIDATES, RPC_URL } from '../config'
import { formatRpcError } from './rpc-errors'

describe('RPC defaults', () => {
  it('defaults away from official mainnet RPC that 403s browsers', () => {
    expect(DEFAULT_RPC_CANDIDATES[0]).toContain('publicnode.com')
    expect(RPC_URL).not.toBe('https://api.mainnet-beta.solana.com')
  })
})

describe('formatRpcError', () => {
  it('maps 403 Access forbidden into a clear desk message', () => {
    const msg = formatRpcError(
      new Error(
        'failed to get recent blockhash: Error: 403 : {"jsonrpc":"2.0","error":{"code": 403, "message":"Access forbidden"}}',
      ),
    )
    expect(msg).toMatch(/403|RPC blocked|VITE_RPC_URL/i)
    expect(msg.toLowerCase()).not.toContain('jsonrpc')
  })
})
