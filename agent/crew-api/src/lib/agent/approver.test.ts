import { describe, expect, it } from 'vitest'
import {
  assertWalletMayApprove,
  normalizeWallet,
  parseApproverAllowlist,
} from './approver.js'

const OPERATOR = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
const LAUNCHER = '11111111111111111111111111111111'
const UNKNOWN = 'So11111111111111111111111111111111111111112'

describe('approver allowlist', () => {
  it('parses CREWPAY_APPROVER_WALLETS', () => {
    const list = parseApproverAllowlist({
      CREWPAY_APPROVER_WALLETS: `${OPERATOR}, ${UNKNOWN}`,
    } as NodeJS.ProcessEnv)
    expect(list).toEqual([OPERATOR, UNKNOWN])
  })

  it('normalizes base58 wallets', () => {
    expect(normalizeWallet(` ${OPERATOR} `)).toBe(OPERATOR)
    expect(normalizeWallet('not-a-wallet')).toBeNull()
  })

  it('rejects launcher even when listed', async () => {
    await expect(
      assertWalletMayApprove({
        wallet: LAUNCHER,
        apiKeyFp: 'fp',
        launcherPubkey: LAUNCHER,
        allowlist: [LAUNCHER, OPERATOR],
      }),
    ).rejects.toThrow(/Launcher\/burner/)
  })

  it('rejects unknown wallets', async () => {
    await expect(
      assertWalletMayApprove({
        wallet: UNKNOWN,
        apiKeyFp: 'fp',
        launcherPubkey: LAUNCHER,
        allowlist: [OPERATOR],
      }),
    ).rejects.toThrow(/not on the approver allowlist/)
  })

  it('accepts allowlisted wallets', async () => {
    await expect(
      assertWalletMayApprove({
        wallet: OPERATOR,
        apiKeyFp: 'fp',
        launcherPubkey: LAUNCHER,
        allowlist: [OPERATOR],
      }),
    ).resolves.toBeUndefined()
  })

  it('refuses when allowlist empty', async () => {
    await expect(
      assertWalletMayApprove({
        wallet: OPERATOR,
        apiKeyFp: 'fp',
        allowlist: [],
      }),
    ).rejects.toThrow(/Approvals disabled/)
  })
})
