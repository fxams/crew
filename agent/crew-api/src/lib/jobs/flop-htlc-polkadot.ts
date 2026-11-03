import { ApiPromise, HttpProvider, WsProvider } from '@polkadot/api'
import type { SubmittableExtrinsic } from '@polkadot/api/types'
import { Keyring } from '@polkadot/keyring'
import type { KeyringPair } from '@polkadot/keyring/types'
import { cryptoWaitReady } from '@polkadot/util-crypto'
import { FLOP_DEVNET_CHAIN_ID, FLOP_SS58_FORMAT, HAS_STATION_PALLET, normalizeHex } from './flop-devnet.js'
import {
  type EscrowRecord,
  type FlopChainIo,
  type FlopHtlcCall,
  FlopHtlcClient,
  type HtlcRecord,
  type SubmitResult,
} from './flop-htlc-client.js'
import { decodeEscrowJson, escrowIdFromEvents } from './flop-htlc-decode.js'
import { FlopHtlcError, publicErrorDetail } from './flop-htlc-errors.js'
import { FlopJsonRpc, type FlopNetworkIdentity } from './flop-htlc-rpc.js'

const HAS_STATION_RPC_DEFS = {
  hasStation: {
    checkHTLCStatus: {
      description: 'Read HTLC status and its authenticated quote digest',
      params: [{ name: 'hash_lock', type: 'H256' }],
      type: 'Json',
    },
    getHtlcByHashLock: {
      description: 'Get HTLC by hash lock',
      params: [{ name: 'hash_lock', type: 'H256' }],
      type: 'Json',
    },
  },
}

export type PolkadotFlopHtlcOptions = {
  rpcUrl: string
  chainId?: string
  /** Substrate URI. Must come from env; never generate or log. */
  signingUri?: string | null
  expectedGenesisHash?: string
  fetch?: typeof fetch
}

function providerFor(rpcUrl: string): HttpProvider | WsProvider {
  const u = rpcUrl.trim()
  if (u.startsWith('ws://') || u.startsWith('wss://')) return new WsProvider(u)
  return new HttpProvider(u)
}

function pairFromUri(uri: string): KeyringPair {
  const keyring = new Keyring({ type: 'sr25519', ss58Format: FLOP_SS58_FORMAT })
  return keyring.addFromUri(uri)
}

function hasStationTx(api: ApiPromise) {
  const names = ['hasStation', 'HasStation', 'has_station']
  for (const name of names) {
    if (api.tx[name]) return { name, tx: api.tx[name], query: api.query[name], events: api.events[name] }
  }
  throw new FlopHtlcError('RPC_ERROR', 'HAS Station pallet is not in this runtime metadata')
}

function extrinsicFor(api: ApiPromise, call: FlopHtlcCall): SubmittableExtrinsic<'promise'> {
  const pallet = hasStationTx(api)
  if (call.method === 'openEscrow') {
    return pallet.tx.openEscrow(call.payee, call.amount, call.policy, call.deadlineBlocks)
  }
  if (call.method === 'satisfyEscrow') {
    // Hex strings, not Uint8Array: the arg is Vec<Bytes>; a raw U8A is treated as SCALE-pre-encoded.
    return pallet.tx.satisfyEscrow(call.escrowId, call.preimages)
  }
  if (call.method === 'approveEscrow') {
    return pallet.tx.approveEscrow(call.escrowId)
  }
  return pallet.tx.refundEscrow(call.escrowId)
}

export class PolkadotFlopChainIo implements FlopChainIo {
  readonly rpcUrl: string
  readonly chainId: string
  readonly canSign: boolean
  private readonly rpc: FlopJsonRpc
  private readonly signingUri: string | null
  private api?: ApiPromise
  private pair?: KeyringPair
  private identity?: FlopNetworkIdentity

  constructor(opts: PolkadotFlopHtlcOptions) {
    this.rpcUrl = opts.rpcUrl
    this.chainId = opts.chainId || FLOP_DEVNET_CHAIN_ID
    this.signingUri = opts.signingUri?.trim() || null
    this.canSign = Boolean(this.signingUri)
    this.rpc = new FlopJsonRpc({
      rpcUrl: opts.rpcUrl,
      chainId: this.chainId,
      expectedGenesisHash: opts.expectedGenesisHash,
      fetch: opts.fetch,
    })
  }

  async assertIdentity(): Promise<FlopNetworkIdentity> {
    this.identity ??= await this.rpc.assertIdentity()
    return this.identity
  }

  private async connect(): Promise<ApiPromise> {
    if (this.api) return this.api
    await this.assertIdentity()
    await cryptoWaitReady()
    if (this.signingUri) this.pair = pairFromUri(this.signingUri)
    this.api = await ApiPromise.create({
      provider: providerFor(this.rpcUrl),
      rpc: HAS_STATION_RPC_DEFS,
      noInitWarn: true,
    })
    const live = this.api.genesisHash.toHex().toLowerCase()
    if (live !== this.rpc.expectedGenesisHash) {
      await this.disconnect()
      throw new FlopHtlcError(
        'NETWORK_MISMATCH',
        `FLOP genesis mismatch after connect: rpc=${live} pinned=${this.rpc.expectedGenesisHash}`,
      )
    }
    if (!this.api.tx[HAS_STATION_PALLET] && !this.api.tx.HasStation) {
      await this.disconnect()
      throw new FlopHtlcError('RPC_ERROR', 'Connected runtime has no hasStation pallet')
    }
    return this.api
  }

  async getEscrow(id: string): Promise<EscrowRecord | null> {
    const api = await this.connect()
    const pallet = hasStationTx(api)
    const raw = await pallet.query.escrows(normalizeHex(id))
    if (!raw || (raw as { isNone?: boolean }).isNone) return null
    const json = typeof (raw as { toJSON?: () => unknown }).toJSON === 'function'
      ? (raw as { toJSON: () => unknown }).toJSON()
      : raw
    return decodeEscrowJson(json)
  }

  async checkHtlcStatus(hashLock: string): Promise<HtlcRecord | null> {
    const json = await this.rpc.checkHtlcStatus(hashLock)
    if (json == null) {
      const api = await this.connect()
      const pallet = hasStationTx(api)
      const raw = await pallet.query.htlcsByHashLock(normalizeHex(hashLock))
      if (!raw || (raw as { isNone?: boolean }).isNone) return null
      const rec = (raw as { toJSON: () => Record<string, unknown> }).toJSON()
      return {
        htlcId: rec.htlcId ? normalizeHex(String(rec.htlcId)) : undefined,
        hashLock: normalizeHex(String(rec.hashLock ?? hashLock)),
        status: String(rec.status ?? 'Created'),
        rewardAmount: rec.rewardAmount != null ? BigInt(String(rec.rewardAmount)) : undefined,
        timeoutBlock: rec.timeoutBlock != null ? Number(rec.timeoutBlock) : undefined,
        raw: rec,
      }
    }
    const rec = json as Record<string, unknown>
    return {
      htlcId: rec.htlc_id || rec.htlcId ? normalizeHex(String(rec.htlc_id ?? rec.htlcId)) : undefined,
      hashLock: normalizeHex(String(rec.hash_lock ?? rec.hashLock ?? hashLock)),
      status: String(rec.status ?? 'Created'),
      raw: rec,
    }
  }

  async currentBlock(): Promise<number> {
    const header = await this.rpc.call<{ number?: string }>('chain_getHeader')
    const n = header?.number
    if (typeof n === 'string') return Number.parseInt(n, n.startsWith('0x') ? 16 : 10)
    const api = await this.connect()
    return (await api.rpc.chain.getHeader()).number.toNumber()
  }

  async submit(call: FlopHtlcCall): Promise<SubmitResult> {
    if (!this.signingUri || !this.canSign) {
      throw new FlopHtlcError('MISSING_SIGNER', 'FLOP_SIGNING_URI is not set')
    }
    const api = await this.connect()
    const pair = this.pair
    if (!pair) throw new FlopHtlcError('MISSING_SIGNER', 'Signing pair was not loaded')
    const tx = extrinsicFor(api, call)
    return new Promise<SubmitResult>((resolve, reject) => {
      let unsub: (() => void) | undefined
      tx.signAndSend(pair, (result) => {
        const { status, events, dispatchError, txHash } = result
        if (dispatchError) {
          unsub?.()
          let detail = dispatchError.toString()
          if (dispatchError.isModule) {
            const meta = api.registry.findMetaError(dispatchError.asModule)
            detail = `${meta.section}.${meta.name}: ${meta.docs.join(' ')}`.trim()
          }
          reject(new FlopHtlcError('SUBMIT_FAILED', publicErrorDetail(detail)))
          return
        }
        if (status.isInBlock || status.isFinalized) {
          unsub?.()
          resolve({
            txHash: txHash.toHex(),
            escrowId: escrowIdFromEvents(events as never),
          })
        }
      })
        .then((u) => {
          unsub = u
        })
        .catch((err) => {
          reject(new FlopHtlcError('SUBMIT_FAILED', publicErrorDetail(err), { cause: err }))
        })
    })
  }

  async disconnect(): Promise<void> {
    const api = this.api
    this.api = undefined
    this.pair = undefined
    this.identity = undefined
    if (api) await api.disconnect()
  }
}

export async function createPolkadotFlopHtlcClient(opts: PolkadotFlopHtlcOptions): Promise<FlopHtlcClient> {
  return new FlopHtlcClient(new PolkadotFlopChainIo(opts))
}
