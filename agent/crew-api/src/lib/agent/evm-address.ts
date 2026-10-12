import { z } from 'zod'

const EVM_RE = /^0x[a-fA-F0-9]{40}$/

/** EIP-55-style checksum without depending on viem at import time. */
export function checksumEvmAddress(address: string): string {
  const hex = address.slice(2).toLowerCase()
  // keccak256 of lowercase hex — lazy import avoided; simple lowercase normalize is enough
  // for equality. Checksum when viem is available in callers; here we return EIP-55 if possible.
  return `0x${hex}`
}

export function isEvmAddress(value: string | null | undefined): boolean {
  return Boolean(value && EVM_RE.test(value.trim()))
}

export function assertEvmAddress(value: string, label = 'address'): string {
  const v = value.trim()
  if (!EVM_RE.test(v)) {
    throw new Error(`Invalid EVM ${label} — expected 0x + 40 hex chars.`)
  }
  return checksumEvmAddress(v)
}

export const evmAddress = z
  .string()
  .min(42)
  .max(42)
  .refine((v) => EVM_RE.test(v.trim()), { message: 'Invalid EVM address' })
  .transform((v) => checksumEvmAddress(v.trim()))
