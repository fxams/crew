import { describe, expect, it, beforeEach } from 'vitest'
import {
  approveDryRunWithWallet,
  consumeApprovedDryRun,
  createDryRun,
  getDryRun,
  hashLaunchBody,
  hashWireBody,
  resetDryRunStore,
} from './dry-run-store.js'

/** Well-known valid Solana addresses for allowlist tests. */
const OPERATOR = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
const UNKNOWN = 'So11111111111111111111111111111111111111112'
const LAUNCHER = '11111111111111111111111111111111'
const OTHER_LAUNCHER = 'SysvarRent111111111111111111111111111111111'
/** Agent-claimed "owner" — must not be able to self-approve. */
const FAKE_OWNER = 'SysvarC1ock11111111111111111111111111111111'

describe('dry-run-store', () => {
  beforeEach(() => {
    resetDryRunStore()
    delete process.env.DATABASE_URL
    process.env.CREWPAY_APPROVER_WALLETS = OPERATOR
  })

  const launchBody = {
    name: 'Desk Cat',
    ticker: 'DCAT',
    mode: 'agent',
    initialBuySol: 0,
    autoHire: { seats: 3 },
  }
  const imageSha = 'a'.repeat(64)

  it('hashes launch bodies with image sha, not presence flags', () => {
    const a = hashLaunchBody(launchBody, imageSha)
    const b = hashLaunchBody({ ...launchBody, imageUrl: 'https://example.com/a.png' }, imageSha)
    expect(a).toBe(b)
    expect(a).not.toBe(hashLaunchBody(launchBody, 'b'.repeat(64)))
  })

  it('hashes wire bodies by mint/mode/crew', () => {
    const a = hashWireBody({ mint: 'Mint111', mode: 'agent' })
    expect(a).toBe(hashWireBody({ mint: 'Mint111', mode: 'agent', crew: null }))
    expect(a).not.toBe(hashWireBody({ mint: 'Mint222', mode: 'agent' }))
  })

  it('requires wallet approval before consume; rejects image mismatch', async () => {
    const bodyHash = hashLaunchBody(launchBody, imageSha)
    const rec = await createDryRun({
      apiKeyFp: 'fp1',
      intent: 'launch',
      bodyHash,
      imageSha256: imageSha,
      plan: { ok: true },
      launcherPubkey: LAUNCHER,
    })
    expect((await getDryRun(rec.id))?.approvedAt).toBeNull()
    await expect(
      consumeApprovedDryRun({
        dryRunId: rec.id,
        apiKeyFp: 'fp1',
        intent: 'launch',
        bodyHash,
        imageSha256: imageSha,
        launcherPubkey: LAUNCHER,
      }),
    ).rejects.toThrow(/not approved/)

    await approveDryRunWithWallet(rec.id, OPERATOR)
    await expect(
      consumeApprovedDryRun({
        dryRunId: rec.id,
        apiKeyFp: 'fp1',
        intent: 'launch',
        bodyHash,
        imageSha256: 'c'.repeat(64),
        launcherPubkey: LAUNCHER,
      }),
    ).rejects.toThrow(/Image content/)

    const used = await consumeApprovedDryRun({
      dryRunId: rec.id,
      apiKeyFp: 'fp1',
      intent: 'launch',
      bodyHash,
      imageSha256: imageSha,
      launcherPubkey: LAUNCHER,
    })
    expect(used.consumedAt).toBeTruthy()
    expect(used.approvedByWallet).toBe(OPERATOR)
  })

  it('gates wire-fees intent separately', async () => {
    const wireBody = { mint: 'MintWire1', mode: 'agent' }
    const bodyHash = hashWireBody(wireBody)
    const rec = await createDryRun({
      apiKeyFp: 'fp1',
      intent: 'wire-fees',
      bodyHash,
      imageSha256: null,
      plan: { mint: 'MintWire1' },
      launcherPubkey: LAUNCHER,
    })
    await approveDryRunWithWallet(rec.id, OPERATOR)
    await expect(
      consumeApprovedDryRun({
        dryRunId: rec.id,
        apiKeyFp: 'fp1',
        intent: 'launch',
        bodyHash,
        launcherPubkey: LAUNCHER,
      }),
    ).rejects.toThrow(/intent/)
    const used = await consumeApprovedDryRun({
      dryRunId: rec.id,
      apiKeyFp: 'fp1',
      intent: 'wire-fees',
      bodyHash,
      launcherPubkey: LAUNCHER,
    })
    expect(used.intent).toBe('wire-fees')
  })

  it('rejects self-approval by the launcher/burner wallet', async () => {
    const bodyHash = hashLaunchBody(launchBody, imageSha)
    const rec = await createDryRun({
      apiKeyFp: 'fp1',
      intent: 'launch',
      bodyHash,
      imageSha256: imageSha,
      launcherPubkey: LAUNCHER,
      plan: { ok: true },
    })
    await expect(approveDryRunWithWallet(rec.id, LAUNCHER)).rejects.toThrow(
      /Launcher\/burner wallet cannot approve/,
    )
    expect((await getDryRun(rec.id))?.approvedAt).toBeNull()
  })

  it('rejects an agent that sets its own owner wallet and self-approves', async () => {
    const bodyHash = hashLaunchBody(launchBody, imageSha)
    const rec = await createDryRun({
      apiKeyFp: 'fp1',
      intent: 'launch',
      bodyHash,
      imageSha256: imageSha,
      launcherPubkey: LAUNCHER,
      plan: { ok: true },
    })
    // Even if the agent "registered" FAKE_OWNER as ownerWallet, env allowlist wins.
    await expect(approveDryRunWithWallet(rec.id, FAKE_OWNER)).rejects.toThrow(
      /not on the approver allowlist/,
    )
    expect((await getDryRun(rec.id))?.approvedAt).toBeNull()
  })

  it('rejects an unknown (non-allowlisted) wallet', async () => {
    const bodyHash = hashLaunchBody(launchBody, imageSha)
    const rec = await createDryRun({
      apiKeyFp: 'fp1',
      intent: 'launch',
      bodyHash,
      imageSha256: imageSha,
      launcherPubkey: LAUNCHER,
      plan: { ok: true },
    })
    await expect(approveDryRunWithWallet(rec.id, UNKNOWN)).rejects.toThrow(
      /not on the approver allowlist/,
    )
    expect((await getDryRun(rec.id))?.approvedAt).toBeNull()
  })

  it('accepts a CREWPAY_APPROVER_WALLETS wallet', async () => {
    const bodyHash = hashLaunchBody(launchBody, imageSha)
    const rec = await createDryRun({
      apiKeyFp: 'fp1',
      intent: 'launch',
      bodyHash,
      imageSha256: imageSha,
      launcherPubkey: LAUNCHER,
      plan: { ok: true },
    })
    const approved = await approveDryRunWithWallet(rec.id, OPERATOR)
    expect(approved.approvedAt).toBeTruthy()
    expect(approved.approvedByWallet).toBe(OPERATOR)
  })

  it('refuses all approvals when the allowlist is empty', async () => {
    delete process.env.CREWPAY_APPROVER_WALLETS
    delete process.env.CREW_APPROVER_WALLETS
    const bodyHash = hashLaunchBody(launchBody, imageSha)
    const rec = await createDryRun({
      apiKeyFp: 'fp1',
      intent: 'launch',
      bodyHash,
      imageSha256: imageSha,
      launcherPubkey: LAUNCHER,
      plan: { ok: true },
    })
    await expect(
      approveDryRunWithWallet(rec.id, OPERATOR, { allowlist: [] }),
    ).rejects.toThrow(/Approvals disabled/)
  })

  it('rejects a dry-run with no launcherPubkey', async () => {
    await expect(
      createDryRun({
        apiKeyFp: 'fp1',
        intent: 'launch',
        bodyHash: hashLaunchBody(launchBody, imageSha),
        imageSha256: imageSha,
        plan: { ok: true },
        launcherPubkey: '',
      }),
    ).rejects.toThrow(/launcherPubkey is required/)
  })

  it('rejects launch with a different launcher than the dry-run', async () => {
    const bodyHash = hashLaunchBody(launchBody, imageSha)
    const rec = await createDryRun({
      apiKeyFp: 'fp1',
      intent: 'launch',
      bodyHash,
      imageSha256: imageSha,
      launcherPubkey: LAUNCHER,
      plan: { ok: true },
    })
    await approveDryRunWithWallet(rec.id, OPERATOR)
    await expect(
      consumeApprovedDryRun({
        dryRunId: rec.id,
        apiKeyFp: 'fp1',
        intent: 'launch',
        bodyHash,
        imageSha256: imageSha,
        launcherPubkey: OTHER_LAUNCHER,
      }),
    ).rejects.toThrow(/does not match the approved dry-run launcherPubkey/)
  })
})
