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

describe('dry-run-store', () => {
  beforeEach(() => {
    resetDryRunStore()
    delete process.env.DATABASE_URL
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
    })
    expect((await getDryRun(rec.id))?.approvedAt).toBeNull()
    await expect(
      consumeApprovedDryRun({
        dryRunId: rec.id,
        apiKeyFp: 'fp1',
        intent: 'launch',
        bodyHash,
        imageSha256: imageSha,
      }),
    ).rejects.toThrow(/not approved/)

    await approveDryRunWithWallet(rec.id, 'Wallet111')
    await expect(
      consumeApprovedDryRun({
        dryRunId: rec.id,
        apiKeyFp: 'fp1',
        intent: 'launch',
        bodyHash,
        imageSha256: 'c'.repeat(64),
      }),
    ).rejects.toThrow(/Image content/)

    const used = await consumeApprovedDryRun({
      dryRunId: rec.id,
      apiKeyFp: 'fp1',
      intent: 'launch',
      bodyHash,
      imageSha256: imageSha,
    })
    expect(used.consumedAt).toBeTruthy()
    expect(used.approvedByWallet).toBe('Wallet111')
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
    })
    await approveDryRunWithWallet(rec.id, 'Wallet222')
    await expect(
      consumeApprovedDryRun({
        dryRunId: rec.id,
        apiKeyFp: 'fp1',
        intent: 'launch',
        bodyHash,
      }),
    ).rejects.toThrow(/intent/)
    const used = await consumeApprovedDryRun({
      dryRunId: rec.id,
      apiKeyFp: 'fp1',
      intent: 'wire-fees',
      bodyHash,
    })
    expect(used.intent).toBe('wire-fees')
  })
})
