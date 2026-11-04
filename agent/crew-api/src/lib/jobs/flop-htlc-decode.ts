import { normalizeHex } from './flop-devnet.js'
import type { ChainPolicy, EscrowRecord, EscrowStatus } from './flop-htlc-client.js'
import { FlopHtlcError } from './flop-htlc-errors.js'

function asStatus(value: unknown): EscrowStatus {
  const s = String(value)
  if (s === 'Released' || s === 'Refunded' || s === 'Open') return s
  throw new FlopHtlcError('RPC_ERROR', `Unexpected escrow status ${s}`)
}

function asPolicy(raw: unknown): ChainPolicy {
  const rec = (raw || {}) as { combinator?: Record<string, unknown>; clauses?: unknown[] }
  const combinatorRaw = rec.combinator || { and: null }
  let combinator: ChainPolicy['combinator']
  if ('threshold' in combinatorRaw || 'Threshold' in combinatorRaw) {
    const k = Number(combinatorRaw.threshold ?? combinatorRaw.Threshold ?? 1)
    combinator = { Threshold: k }
  } else if ('or' in combinatorRaw || 'Or' in combinatorRaw) {
    combinator = { Or: null }
  } else {
    combinator = { And: null }
  }
  const clauses = (rec.clauses || []).map((clause) => {
    const c = clause as Record<string, unknown>
    if (c.hash != null || c.Hash != null) return { Hash: normalizeHex(String(c.hash ?? c.Hash)) }
    if (c.sig != null || c.Sig != null) return { Sig: String(c.sig ?? c.Sig) }
    if (c.before != null || c.Before != null) return { Before: Number(c.before ?? c.Before) }
    if (c.after != null || c.After != null) return { After: Number(c.after ?? c.After) }
    if (c.point != null || c.Point != null) return { Point: String(c.point ?? c.Point) }
    throw new FlopHtlcError('RPC_ERROR', 'Unrecognized policy clause')
  })
  return { combinator, clauses }
}

export function decodeEscrowJson(raw: unknown): EscrowRecord | null {
  if (raw == null) return null
  const rec = raw as Record<string, unknown>
  if (rec.isNone === true) return null
  const body = (rec.isSome ? rec.unwrap ?? rec : rec) as Record<string, unknown>
  const id = String(body.id ?? '')
  if (!id || id === '0x') return null
  return {
    id: normalizeHex(id),
    funder: String(body.funder ?? ''),
    payee: String(body.payee ?? ''),
    amount: BigInt(String(body.amount ?? '0')),
    policy: asPolicy(body.policy),
    deadline: Number(body.deadline ?? 0),
    status: asStatus(body.status ?? 'Open'),
    createdBlock: Number(body.createdBlock ?? body.created_block ?? 0),
  }
}

export function escrowIdFromEvents(
  events: Array<{ event?: { section?: string; method?: string; data?: unknown } }>,
): string | undefined {
  for (const record of events) {
    const ev = record.event
    if (!ev) continue
    if (!/hasstation/i.test(ev.section || '')) continue
    if (ev.method !== 'EscrowOpened') continue
    const data = ev.data as { escrowId?: unknown; escrow_id?: unknown; toJSON?: () => unknown } | unknown[]
    if (Array.isArray(data)) {
      const first = data[0]
      if (first != null) return normalizeHex(String(first))
    } else if (data && typeof data === 'object') {
      const rec = data as { escrowId?: unknown; escrow_id?: unknown; toJSON?: () => Record<string, unknown> }
      const json = rec.toJSON?.() ?? rec
      const id =
        (json as { escrowId?: unknown; escrow_id?: unknown }).escrowId
        ?? (json as { escrow_id?: unknown }).escrow_id
        ?? rec.escrowId
        ?? rec.escrow_id
      if (id != null) return normalizeHex(String(id))
    }
  }
  return undefined
}
