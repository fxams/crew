import { describe, expect, it, beforeEach } from 'vitest'
import {
  assertWalletMayApprove,
  normalizeWallet,
  parseApproverAllowlist,
  resolveApproverAllowlist,
} from './approver.js'

const OPERATOR = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
const LAUNCHER = '11111111111111111111111111111111'
const UNKNOWN = 'So11111111111111111111111111111111111111112'
/** Would-be "owner" wallet an agent tries to self-register — must NOT approve. */
const FAKE_OWNER = 'SysvarRent111111111111111111111111111111111'

describe('approver allowlist', () => {
  beforeEach(() => {
    process.env.CREWPAY_APPROVER_WALLETS = OPERATOR
  })

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

  it('resolveApproverAllowlist is env-only (ignores any ownerWallet concept)', () => {
    expect(resolveApproverAllowlist()).toEqual([OPERATOR])
    expect(resolveApproverAllowlist({ env: { CREWPAY_APPROVER_WALLETS: '' } })).toEqual([])
  })

  it('rejects launcher even when listed', async () => {
    await expect(
      assertWalletMayApprove({
        wallet: LAUNCHER,
        launcherPubkey: LAUNCHER,
        allowlist: [LAUNCHER, OPERATOR],
      }),
    ).rejects.toThrow(/Launcher\/burner/)
  })

  it('rejects unknown wallets and agent-claimed owner wallets', async () => {
    await expect(
      assertWalletMayApprove({
        wallet: UNKNOWN,
        launcherPubkey: LAUNCHER,
        allowlist: [OPERATOR],
      }),
    ).rejects.toThrow(/not on the approver allowlist/)
    await expect(
      assertWalletMayApprove({
        wallet: FAKE_OWNER,
        launcherPubkey: LAUNCHER,
        allowlist: [OPERATOR],
      }),
    ).rejects.toThrow(/not on the approver allowlist/)
  })

  it('accepts CREWPAY_APPROVER_WALLETS wallets', async () => {
    await expect(
      assertWalletMayApprove({
        wallet: OPERATOR,
        launcherPubkey: LAUNCHER,
        allowlist: [OPERATOR],
      }),
    ).resolves.toBeUndefined()
  })

  it('refuses when allowlist empty', async () => {
    await expect(
      assertWalletMayApprove({
        wallet: OPERATOR,
        launcherPubkey: LAUNCHER,
        allowlist: [],
      }),
    ).rejects.toThrow(/Approvals disabled/)
  })

  it('refuses approval when dry-run has no launcherPubkey', async () => {
    await expect(
      assertWalletMayApprove({
        wallet: OPERATOR,
        launcherPubkey: null,
        allowlist: [OPERATOR],
      }),
    ).rejects.toThrow(/missing launcherPubkey/)
  })
})
