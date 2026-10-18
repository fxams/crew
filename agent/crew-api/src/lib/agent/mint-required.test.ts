import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { errorMessage } from './errors.js'
import { PUMP_MINT_REQUIRED, pumpUnsignedNeedsMint, resolveUnsignedPumpMint } from './mint-required.js'

describe('resolveUnsignedPumpMint', () => {
  it('rejects a missing mint so the API never invents an unsignable keypair', () => {
    expect(() => resolveUnsignedPumpMint(undefined)).toThrow(PUMP_MINT_REQUIRED)
    expect(() => resolveUnsignedPumpMint('')).toThrow(/mintPubkey is required/)
    expect(() => resolveUnsignedPumpMint('   ')).toThrow(/does not keep a server-side mint secret/)
  })

  it('returns a caller-supplied mint', () => {
    expect(resolveUnsignedPumpMint(' Dg85fQuf6MmmiTCyNvKDfaXHzqRvWHd52SRXmGw9EzDN ')).toBe(
      'Dg85fQuf6MmmiTCyNvKDfaXHzqRvWHd52SRXmGw9EzDN',
    )
  })

  it('only requires mint on Pump.fun unsigned builds', () => {
    expect(pumpUnsignedNeedsMint('pumpfun')).toBe(true)
    expect(pumpUnsignedNeedsMint(undefined)).toBe(true)
    expect(pumpUnsignedNeedsMint('bags')).toBe(false)
    expect(pumpUnsignedNeedsMint('zora')).toBe(false)
  })

  it('formats the HTTP 400 the unsigned route returns when mint is omitted', () => {
    const schema = z
      .object({
        platform: z.enum(['pumpfun', 'bags']).optional().default('pumpfun'),
        mintPubkey: z.string().optional(),
      })
      .superRefine((val, ctx) => {
        if (pumpUnsignedNeedsMint(val.platform) && !val.mintPubkey?.trim()) {
          ctx.addIssue({ code: 'custom', message: PUMP_MINT_REQUIRED, path: ['mintPubkey'] })
        }
      })
    const r = schema.safeParse({ launcherPubkey: 'x' })
    expect(r.success).toBe(false)
    if (r.success) return
    const msg = errorMessage(r.error)
    expect(msg).toMatch(/^Invalid request — mintPubkey:/)
    expect(msg).toContain('does not keep a server-side mint secret')
    expect(schema.safeParse({ platform: 'bags' }).success).toBe(true)
    expect(schema.safeParse({ mintPubkey: 'Dg85fQuf6MmmiTCyNvKDfaXHzqRvWHd52SRXmGw9EzDN' }).success).toBe(
      true,
    )
  })
})
