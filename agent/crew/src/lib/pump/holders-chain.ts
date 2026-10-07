import { PublicKey, type Connection } from '@solana/web3.js'
import {
  bondingCurvePda,
  feeSharingConfigPda,
  isSharingConfigEditable,
  pumpPoolAuthorityPda,
} from '@pump-fun/pump-sdk'
import { RPC_FAILOVER } from '../config'
import type { CoinRecord, DeskMode } from '../types'
import {
  formatRpcError,
  getConnection,
  getPumpSdk,
  switchRpc,
  getActiveRpcUrl,
} from './connection'
import { isRpcForbidden } from './rpc-errors'
import {
  proposeHolderKolShares,
  TOP_HOLDER_ACCOUNTS,
  type HolderKolProposal,
  type HolderRow,
} from './holder-kol'

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function withRpcFailover<T>(fn: (conn: Connection) => Promise<T>): Promise<T> {
  const start = Math.max(0, RPC_FAILOVER.indexOf(getActiveRpcUrl()))
  const order = [...RPC_FAILOVER.slice(start), ...RPC_FAILOVER.slice(0, start)]
  let lastErr: unknown
  for (const endpoint of order) {
    try {
      if (endpoint !== getActiveRpcUrl()) switchRpc(endpoint)
      return await fn(getConnection())
    } catch (err) {
      lastErr = err
      console.warn('holder RPC failed', endpoint, err)
      if (!isRpcForbidden(err) && !/429|too many|indexed|personal token/i.test(String(err))) {
        break
      }
      await sleep(400)
    }
  }
  throw new Error(formatRpcError(lastErr))
}

export async function fetchVaultOwnerSet(mintStr: string): Promise<Set<string>> {
  const mint = new PublicKey(mintStr)
  const set = new Set<string>()
  try {
    set.add(bondingCurvePda(mint).toBase58())
  } catch {
    /* ignore */
  }
  try {
    set.add(feeSharingConfigPda(mint).toBase58())
  } catch {
    /* ignore */
  }
  try {
    set.add(pumpPoolAuthorityPda(mint).toBase58())
  } catch {
    /* ignore */
  }
  return set
}

export async function fetchTopHolders(mintStr: string): Promise<HolderRow[]> {
  const mint = new PublicKey(mintStr)
  return withRpcFailover(async (conn) => {
    const largest = await conn.getTokenLargestAccounts(mint)
    const rows: HolderRow[] = []
    const slice = largest.value.slice(0, TOP_HOLDER_ACCOUNTS)
    for (const entry of slice) {
      const info = await conn.getParsedAccountInfo(entry.address)
      const data = info.value?.data
      if (!data || typeof data === 'string' || Buffer.isBuffer(data) || !('parsed' in data)) {
        continue
      }
      const parsed = data.parsed as {
        info?: {
          owner?: string
          tokenAmount?: { amount?: string; uiAmount?: number | null }
        }
      }
      const owner = parsed.info?.owner
      const amount = parsed.info?.tokenAmount?.amount ?? entry.amount
      const uiAmount =
        parsed.info?.tokenAmount?.uiAmount ??
        (typeof entry.uiAmount === 'number' ? entry.uiAmount : Number(entry.uiAmountString || 0))
      if (!owner) continue
      rows.push({
        tokenAccount: entry.address.toBase58(),
        owner,
        amount: String(amount),
        uiAmount: Number(uiAmount) || 0,
      })
    }
    return rows
  })
}

export async function isFeeShareEditable(mintStr: string): Promise<{
  exists: boolean
  editable: boolean
  reason?: string
}> {
  const mint = new PublicKey(mintStr)
  const connection = getConnection()
  const sdk = getPumpSdk()
  const pda = feeSharingConfigPda(mint)
  const info = await connection.getAccountInfo(pda)
  if (!info) {
    return {
      exists: false,
      editable: true,
      reason: 'No fee-sharing config yet — lock will create + finalize in one step.',
    }
  }
  const sharing = sdk.decodeSharingConfig(info)
  const editable = isSharingConfigEditable({ sharingConfig: sharing })
  return {
    exists: true,
    editable,
    reason: editable
      ? 'Fee-share still open — you can lock holder KOLs once.'
      : 'Fee-share already finalized on-chain (Pump allows one lock). Live ranking is view-only.',
  }
}

export async function scanHolderKols(opts: {
  mint: string
  mode: DeskMode
  deskWallet?: string
}): Promise<HolderKolProposal & { editable: boolean; editReason?: string }> {
  const [holders, vaultOwners, edit] = await Promise.all([
    fetchTopHolders(opts.mint),
    fetchVaultOwnerSet(opts.mint),
    isFeeShareEditable(opts.mint),
  ])
  const proposal = proposeHolderKolShares({
    holders,
    mode: opts.mode,
    deskWallet: opts.deskWallet,
    vaultOwners,
  })
  return {
    ...proposal,
    editable: edit.editable,
    editReason: edit.reason,
  }
}

export function proposalFingerprint(p: Pick<HolderKolProposal, 'shareholders'>): string {
  return p.shareholders
    .map((s) => `${s.wallet}:${s.bps}`)
    .sort()
    .join('|')
}

export type HolderScanStatus = {
  coin: CoinRecord
  proposal: HolderKolProposal & { editable: boolean; editReason?: string }
}
