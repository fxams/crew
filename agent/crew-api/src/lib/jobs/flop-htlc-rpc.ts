import {
  FLOP_DEVNET_CHAIN_ID,
  FLOP_DEVNET_GENESIS_HASH,
  FLOP_DEVNET_SPEC_NAME,
  HAS_STATION_RPC,
  isFlopDevnetChainId,
  normalizeHex,
  toHttpRpcUrl,
} from './flop-devnet.js'
import { FlopHtlcError, mapHasStationRpcError, publicErrorDetail } from './flop-htlc-errors.js'

export type JsonRpcId = number | string

export type JsonRpcResponse<T> = {
  jsonrpc: '2.0'
  id: JsonRpcId
  result?: T
  error?: { code: number; message: string; data?: unknown }
}

export type FlopNetworkIdentity = {
  chain: string
  genesisHash: string
  specName: string
  specVersion: number
  ss58Format: number
  tokenDecimals: number
  tokenSymbol: string
}

export type FlopRpcOptions = {
  rpcUrl: string
  chainId: string
  expectedGenesisHash?: string
  fetch?: typeof fetch
  timeoutMs?: number
}

function rpcUrl(url: string): string {
  const u = url.trim()
  if (!u) throw new FlopHtlcError('INVALID_PARAMS', 'FLOP_RPC_URL is required')
  return toHttpRpcUrl(u)
}

export class FlopJsonRpc {
  readonly httpUrl: string
  readonly chainId: string
  readonly expectedGenesisHash: string
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number
  private nextId = 1

  constructor(opts: FlopRpcOptions) {
    if (!isFlopDevnetChainId(opts.chainId)) {
      throw new FlopHtlcError(
        'UNSUPPORTED_CHAIN',
        `FLOP htlc client is flop-devnet only (got chain id ${opts.chainId || 'unset'}). Set FLOP_CHAIN_ID=${FLOP_DEVNET_CHAIN_ID}.`,
      )
    }
    const pin = normalizeHex(opts.expectedGenesisHash || FLOP_DEVNET_GENESIS_HASH)
    if (pin !== FLOP_DEVNET_GENESIS_HASH) {
      throw new FlopHtlcError(
        'NETWORK_MISMATCH',
        `Refusing FLOP genesis override ${pin}: pinned flop-devnet genesis is ${FLOP_DEVNET_GENESIS_HASH}`,
      )
    }
    this.httpUrl = rpcUrl(opts.rpcUrl)
    this.chainId = FLOP_DEVNET_CHAIN_ID
    this.expectedGenesisHash = FLOP_DEVNET_GENESIS_HASH
    this.fetchImpl = opts.fetch ?? fetch
    this.timeoutMs = opts.timeoutMs ?? 15_000
  }

  async call<T>(method: string, params: unknown[] = []): Promise<T> {
    const id = this.nextId++
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs)
    let res: Response
    try {
      res = await this.fetchImpl(this.httpUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
        signal: ctrl.signal,
      })
    } catch (err) {
      throw new FlopHtlcError('RPC_ERROR', `FLOP RPC unreachable (${publicErrorDetail(err)})`, { cause: err })
    } finally {
      clearTimeout(timer)
    }
    let body: JsonRpcResponse<T>
    try {
      body = (await res.json()) as JsonRpcResponse<T>
    } catch (err) {
      throw new FlopHtlcError('RPC_ERROR', `FLOP RPC returned a non-JSON body (HTTP ${res.status})`, { cause: err })
    }
    if (body.error) throw mapHasStationRpcError(body.error)
    return body.result as T
  }

  async readIdentity(): Promise<FlopNetworkIdentity> {
    const [chain, genesisHash, runtime, properties] = await Promise.all([
      this.call<string>('system_chain'),
      this.call<string>('chain_getBlockHash', [0]),
      this.call<{ specName: string; specVersion: number }>('state_getRuntimeVersion'),
      this.call<{ ss58Format?: number; tokenDecimals?: number | number[]; tokenSymbol?: string | string[] }>(
        'system_properties',
      ),
    ])
    const decimals = Array.isArray(properties.tokenDecimals) ? properties.tokenDecimals[0] : properties.tokenDecimals
    const symbol = Array.isArray(properties.tokenSymbol) ? properties.tokenSymbol[0] : properties.tokenSymbol
    return {
      chain,
      genesisHash: normalizeHex(genesisHash),
      specName: runtime.specName,
      specVersion: runtime.specVersion,
      ss58Format: properties.ss58Format ?? 42,
      tokenDecimals: decimals ?? 18,
      tokenSymbol: symbol ?? 'FLOP',
    }
  }

  /**
   * Fail closed if the RPC is a different network or a reset genesis.
   * `specName` is recorded but not pinned — runtime upgrades are expected on a disposable devnet.
   */
  async assertIdentity(): Promise<FlopNetworkIdentity> {
    const id = await this.readIdentity()
    if (id.genesisHash !== this.expectedGenesisHash) {
      throw new FlopHtlcError(
        'NETWORK_MISMATCH',
        `FLOP genesis mismatch: rpc=${id.genesisHash} pinned=${this.expectedGenesisHash}. ` +
          `Wrong network or a reset. Refusing to continue.`,
      )
    }
    if (id.specName && id.specName !== FLOP_DEVNET_SPEC_NAME) {
      throw new FlopHtlcError(
        'NETWORK_MISMATCH',
        `FLOP spec name mismatch: rpc=${id.specName} expected=${FLOP_DEVNET_SPEC_NAME}`,
      )
    }
    return id
  }

  /**
   * `hasStation_checkHTLCStatus`. Missing HTLCs return null (RPC 32004).
   * Hash must be 32-byte hex; the live node rejects other encodings (RPC 32002).
   */
  async checkHtlcStatus(hashLock: string): Promise<unknown | null> {
    const hl = normalizeHex(hashLock)
    try {
      return await this.call<unknown>(HAS_STATION_RPC.checkHtlcStatus, [hl])
    } catch (err) {
      if (err instanceof FlopHtlcError && err.code === 'HTLC_NOT_FOUND') return null
      throw err
    }
  }
}
