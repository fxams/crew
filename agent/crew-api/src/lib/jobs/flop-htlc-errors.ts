/** Typed errors for the community FLOP has-station client. Never include secrets. */

export type FlopHtlcErrorCode =
  | 'NETWORK_MISMATCH'
  | 'UNSUPPORTED_CHAIN'
  | 'RPC_ERROR'
  | 'HTLC_NOT_FOUND'
  | 'INVALID_HASH_LOCK'
  | 'ESCROW_NOT_FOUND'
  | 'ESCROW_NOT_OPEN'
  | 'MISSING_SIGNER'
  | 'MISSING_PAYEE'
  | 'INVALID_PARAMS'
  | 'SUBMIT_FAILED'
  | 'SUBMIT_TIMEOUT'
  | 'POLICY_NOT_SATISFIED'
  | 'REFUND_NOT_READY'
  | 'PAYEE_DEAD_ACCOUNT'
  | 'ESCROW_ID_MISSING'

export class FlopHtlcError extends Error {
  readonly code: FlopHtlcErrorCode
  readonly rpcCode?: number

  constructor(code: FlopHtlcErrorCode, message: string, opts?: { cause?: unknown; rpcCode?: number }) {
    super(message, opts?.cause !== undefined ? { cause: opts.cause } : undefined)
    this.name = 'FlopHtlcError'
    this.code = code
    this.rpcCode = opts?.rpcCode
  }
}

const SECRET_KEY = /uri|seed|mnemonic|private|secret|preimage|sign/i

/** Drop fields that look like key material before surfacing RPC/node errors. */
export function publicErrorDetail(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') {
    if (SECRET_KEY.test(value) && value.length > 24) return '[redacted]'
    return value.slice(0, 400)
  }
  if (typeof value === 'object') {
    const rec = value as Record<string, unknown>
    const msg = rec.message ?? rec.data ?? rec.error
    if (typeof msg === 'string') return publicErrorDetail(msg)
    try {
      return JSON.stringify(rec).slice(0, 400)
    } catch {
      return 'unprintable error'
    }
  }
  return String(value).slice(0, 400)
}

export function mapHasStationRpcError(err: { code?: number; message?: string; data?: unknown }): FlopHtlcError {
  const code = err.code
  const detail = publicErrorDetail(err.data ?? err.message)
  if (code === 32004 || /htlc not found/i.test(detail)) {
    return new FlopHtlcError('HTLC_NOT_FOUND', 'HTLC not found', { rpcCode: code })
  }
  if (code === 32002 || /invalid hash_lock/i.test(detail)) {
    return new FlopHtlcError('INVALID_HASH_LOCK', 'Invalid hash_lock format', { rpcCode: code })
  }
  if (code === -32602) {
    return new FlopHtlcError('INVALID_PARAMS', `Invalid RPC params${detail ? `: ${detail}` : ''}`, { rpcCode: code })
  }
  return new FlopHtlcError('RPC_ERROR', `FLOP RPC error${detail ? `: ${detail}` : ''}`, { rpcCode: code })
}
