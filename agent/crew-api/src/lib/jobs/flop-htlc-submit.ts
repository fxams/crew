import { FLOP_DEVNET_FAUCET_URL, normalizeHex } from './flop-devnet.js'
import { FlopHtlcError, publicErrorDetail } from './flop-htlc-errors.js'

/** Bounded wait for in-block / finalized (https JSON-RPC cannot subscribe). */
export const DEFAULT_SUBMIT_TIMEOUT_MS = 60_000

export function requireEscrowId(id: string | undefined | null, txHash?: string): string {
  const raw = (id || '').trim()
  if (!raw || raw === '0x' || /^0x0+$/i.test(raw)) {
    const tx = txHash ? ` (tx ${txHash})` : ''
    throw new FlopHtlcError(
      'ESCROW_ID_MISSING',
      `openEscrow produced no escrow id${tx}. The extrinsic may have failed or EscrowOpened was not in the events.`,
    )
  }
  return normalizeHex(raw)
}

export function assertPayeeHasExistentialDeposit(payee: string, free: bigint, existentialDeposit: bigint): void {
  const live = existentialDeposit > 0n ? free >= existentialDeposit : free > 0n
  if (live) return
  throw new FlopHtlcError(
    'PAYEE_DEAD_ACCOUNT',
    `Payee ${payee} is not a live account (free=${free.toString()} raw, existentialDeposit=${existentialDeposit.toString()}). ` +
      `satisfyEscrow would fail with balances.DeadAccount. Fund the payee from ${FLOP_DEVNET_FAUCET_URL} first, then retry claim.`,
  )
}

export type ExtrinsicStatusLike = {
  isInBlock?: boolean
  isFinalized?: boolean
  isInvalid?: boolean
  isDropped?: boolean
  isUsurped?: boolean
}

export type SubmitUpdate = {
  status?: ExtrinsicStatusLike | null
  events?: unknown
  dispatchError?: { isModule?: boolean; asModule?: unknown; toString(): string } | null
  txHash?: { toHex(): string } | string | null
}

export type WaitForInBlockOptions = {
  timeoutMs?: number
  mapDispatchError?: (err: NonNullable<SubmitUpdate['dispatchError']>) => string
}

function txHashOf(update: SubmitUpdate): string | undefined {
  const h = update.txHash
  if (!h) return undefined
  return typeof h === 'string' ? h : h.toHex()
}

/**
 * Watch a signed extrinsic until it is in a block, or fail with a bounded timeout.
 * An undefined `status` is the https HttpProvider case — fail immediately, do not hang.
 */
export function waitForInBlock(
  subscribe: (cb: (update: SubmitUpdate) => void) => Promise<(() => void) | void>,
  opts?: WaitForInBlockOptions,
): Promise<{ txHash: string; events: unknown }> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_SUBMIT_TIMEOUT_MS
  return new Promise((resolve, reject) => {
    let settled = false
    let unsub: (() => void) | undefined
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        unsub?.()
      } catch {
        /* ignore */
      }
      fn()
    }
    const timer = setTimeout(() => {
      finish(() =>
        reject(
          new FlopHtlcError(
            'SUBMIT_TIMEOUT',
            `Extrinsic watch timed out after ${timeoutMs}ms. Signed submit needs a websocket RPC (wss); https JSON-RPC cannot subscribe to in-block status.`,
          ),
        ),
      )
    }, timeoutMs)

    subscribe((update) => {
      try {
        if (update.dispatchError) {
          const detail = opts?.mapDispatchError?.(update.dispatchError) ?? update.dispatchError.toString()
          finish(() => reject(new FlopHtlcError('SUBMIT_FAILED', publicErrorDetail(detail))))
          return
        }
        const status = update.status
        if (!status) {
          finish(() =>
            reject(
              new FlopHtlcError(
                'SUBMIT_FAILED',
                'RPC returned no extrinsic status. https JSON-RPC cannot watch in-block inclusion; use a wss URL (https is rewritten to wss automatically).',
              ),
            ),
          )
          return
        }
        if (status.isInvalid || status.isDropped || status.isUsurped) {
          const why = status.isInvalid ? 'invalid' : status.isDropped ? 'dropped' : 'usurped'
          finish(() => reject(new FlopHtlcError('SUBMIT_FAILED', `Extrinsic ${why}`)))
          return
        }
        if (status.isInBlock || status.isFinalized) {
          const hash = txHashOf(update)
          if (!hash) {
            finish(() => reject(new FlopHtlcError('SUBMIT_FAILED', 'Included extrinsic had no tx hash')))
            return
          }
          finish(() => resolve({ txHash: hash, events: update.events }))
        }
      } catch (err) {
        finish(() => reject(new FlopHtlcError('SUBMIT_FAILED', publicErrorDetail(err), { cause: err })))
      }
    })
      .then((u) => {
        if (typeof u === 'function') unsub = u
      })
      .catch((err) => {
        finish(() => reject(new FlopHtlcError('SUBMIT_FAILED', publicErrorDetail(err), { cause: err })))
      })
  })
}
