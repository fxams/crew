import { describe, expect, it } from 'vitest'
import type { AccountInfo } from '@solana/web3.js'
import { PublicKey } from '@solana/web3.js'
import {
  HOLDER_KOL_UNLOCK_TTL_MS,
  adminRevokedFromSharingAccount,
  isFeeShareAdminRevoked,
  pollAdminRevokedOnChain,
  shouldMarkUnlockedExpired,
} from './fee-lock-integrity.js'

/** Fixture SharingConfig account state (post-updateFeeSharesV2, admin revoked). */
const FIXTURE_ADMIN = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
const FIXTURE_MINT = new PublicKey('So11111111111111111111111111111111111111112')

const FIXTURE_SHARING_CONFIG_REVOKED = {
  version: 2,
  mint: FIXTURE_MINT,
  admin: FIXTURE_ADMIN,
  adminRevoked: true,
  shareholders: [{ address: FIXTURE_ADMIN, shareBps: 10_000 }],
}

const FIXTURE_SHARING_CONFIG_EDITABLE = {
  ...FIXTURE_SHARING_CONFIG_REVOKED,
  adminRevoked: false,
}

function fixtureAccountInfo(): AccountInfo<Buffer> {
  return {
    executable: false,
    owner: PublicKey.default,
    lamports: 1,
    data: Buffer.alloc(0),
  }
}

describe('fee-lock-integrity', () => {
  it('asserts admin revoked on fixture sharing-config account', () => {
    expect(isFeeShareAdminRevoked(FIXTURE_SHARING_CONFIG_REVOKED)).toBe(true)
    expect(isFeeShareAdminRevoked(FIXTURE_SHARING_CONFIG_EDITABLE)).toBe(false)
    // v1 configs are permanently non-editable.
    expect(isFeeShareAdminRevoked({ version: 1, adminRevoked: false })).toBe(true)

    const stubSdk = {
      decodeSharingConfig: () => FIXTURE_SHARING_CONFIG_REVOKED,
    }
    const out = adminRevokedFromSharingAccount(
      fixtureAccountInfo(),
      stubSdk as never,
    )
    expect(out.adminRevoked).toBe(true)
    expect(out.editable).toBe(false)
    expect(out.version).toBe(2)

    const editableOut = adminRevokedFromSharingAccount(fixtureAccountInfo(), {
      decodeSharingConfig: () => FIXTURE_SHARING_CONFIG_EDITABLE,
    } as never)
    expect(editableOut.adminRevoked).toBe(false)
    expect(editableOut.editable).toBe(true)
  })

  it('marks holderKol unlocked ≥24h as unlocked_expired', () => {
    const now = 1_700_000_000_000
    expect(
      shouldMarkUnlockedExpired(
        {
          holderKol: true,
          feeShareSignature: undefined,
          launchedAt: now - HOLDER_KOL_UNLOCK_TTL_MS - 1,
        },
        now,
      ),
    ).toBe(true)
    expect(
      shouldMarkUnlockedExpired(
        {
          holderKol: true,
          feeShareSignature: undefined,
          launchedAt: now - 60_000,
        },
        now,
      ),
    ).toBe(false)
    expect(
      shouldMarkUnlockedExpired(
        {
          holderKol: true,
          feeShareSignature: 'sig',
          launchedAt: now - HOLDER_KOL_UNLOCK_TTL_MS * 2,
        },
        now,
      ),
    ).toBe(false)
    expect(
      shouldMarkUnlockedExpired(
        {
          holderKol: false,
          feeShareSignature: undefined,
          launchedAt: now - HOLDER_KOL_UNLOCK_TTL_MS * 2,
        },
        now,
      ),
    ).toBe(false)
  })

  it('polls sharing-config until adminRevoked (RPC lag)', async () => {
    const mint = PublicKey.default
    let hits = 0
    const ok = await pollAdminRevokedOnChain(mint, {
      delaysMs: [0, 0],
      probe: async () => {
        hits += 1
        if (hits < 3) throw new Error('not indexed')
        return true
      },
    })
    expect(ok).toBe(true)
    expect(hits).toBe(3)
  })

  it('does not mark locked when adminRevoked never confirms', async () => {
    const ok = await pollAdminRevokedOnChain(PublicKey.default, {
      delaysMs: [0],
      probe: async () => {
        throw new Error('still editable')
      },
    })
    expect(ok).toBe(false)
  })
})
