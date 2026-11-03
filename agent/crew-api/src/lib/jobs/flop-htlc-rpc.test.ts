import { describe, expect, it } from 'vitest'
import { FLOP_DEVNET_CHAIN_ID, FLOP_DEVNET_GENESIS_HASH } from './flop-devnet.js'
import { FlopHtlcError } from './flop-htlc-errors.js'
import { FlopJsonRpc } from './flop-htlc-rpc.js'

function rpc(handler: (method: string, params: unknown[]) => unknown, chainId = FLOP_DEVNET_CHAIN_ID) {
  const fetchImpl: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { method: string; params?: unknown[] }
    const result = handler(body.method, body.params || [])
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.method, result }), {
      headers: { 'content-type': 'application/json' },
    })
  }
  return new FlopJsonRpc({
    rpcUrl: 'https://rpc.devnet.flop.network',
    chainId,
    fetch: fetchImpl,
  })
}

function errorRpc(code: number, message: string, data?: unknown) {
  const fetchImpl: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { id: number }
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code, message, data } }), {
      headers: { 'content-type': 'application/json' },
    })
  }
  return new FlopJsonRpc({
    rpcUrl: 'https://rpc.devnet.flop.network',
    chainId: FLOP_DEVNET_CHAIN_ID,
    fetch: fetchImpl,
  })
}

describe('FlopJsonRpc', () => {
  it('refuses a non-devnet chain id without talking to the network', () => {
    expect(() => rpc(() => null, 'flop-testnet')).toThrow(/flop-devnet only/)
  })

  it('refuses a genesis override that is not the pin', () => {
    expect(
      () =>
        new FlopJsonRpc({
          rpcUrl: 'https://rpc.devnet.flop.network',
          chainId: FLOP_DEVNET_CHAIN_ID,
          expectedGenesisHash: `0x${'ab'.repeat(32)}`,
        }),
    ).toThrow(/Refusing FLOP genesis override/)
  })

  it('accepts matching genesis and records identity', async () => {
    const client = rpc((method) => {
      if (method === 'system_chain') return 'FLOP Devnet'
      if (method === 'chain_getBlockHash') return FLOP_DEVNET_GENESIS_HASH
      if (method === 'state_getRuntimeVersion') return { specName: 'tzkv-runtime', specVersion: 1014003 }
      if (method === 'system_properties') return { ss58Format: 42, tokenDecimals: 18, tokenSymbol: 'FLOP' }
      throw new Error(`unexpected ${method}`)
    })
    const id = await client.assertIdentity()
    expect(id.genesisHash).toBe(FLOP_DEVNET_GENESIS_HASH)
    expect(id.chain).toBe('FLOP Devnet')
    expect(id.specVersion).toBe(1014003)
  })

  it('fails closed on a genesis reset or wrong network', async () => {
    const client = rpc((method) => {
      if (method === 'system_chain') return 'FLOP Devnet'
      if (method === 'chain_getBlockHash') return `0x${'00'.repeat(32)}`
      if (method === 'state_getRuntimeVersion') return { specName: 'tzkv-runtime', specVersion: 1 }
      if (method === 'system_properties') return { ss58Format: 42, tokenDecimals: 18, tokenSymbol: 'FLOP' }
      throw new Error(`unexpected ${method}`)
    })
    await expect(client.assertIdentity()).rejects.toMatchObject({ code: 'NETWORK_MISMATCH' })
  })

  it('maps HTLC-not-found to null and invalid hash_lock to a typed error', async () => {
    const missing = errorRpc(32004, 'HTLC not found')
    expect(await missing.checkHtlcStatus(`0x${'11'.repeat(32)}`)).toBeNull()

    const invalid = errorRpc(32002, 'Invalid hash_lock format')
    await expect(invalid.checkHtlcStatus('0x11')).rejects.toBeInstanceOf(FlopHtlcError)
    await expect(invalid.checkHtlcStatus('0x11')).rejects.toMatchObject({ code: 'INVALID_HASH_LOCK' })
  })

  it('rewrites wss RPC URLs to https for JSON-RPC reads', () => {
    const client = new FlopJsonRpc({
      rpcUrl: 'wss://rpc.devnet.flop.network',
      chainId: FLOP_DEVNET_CHAIN_ID,
      fetch: async () => new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: 'ok' })),
    })
    expect(client.httpUrl).toBe('https://rpc.devnet.flop.network')
  })
})
