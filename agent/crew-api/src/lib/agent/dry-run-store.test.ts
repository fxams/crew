import { describe, expect, it, beforeEach } from 'vitest'
import {
  approveDryRun,
  consumeApprovedDryRun,
  createDryRun,
  getDryRun,
  hashLaunchBody,
  resetDryRunStore,
} from './dry-run-store.js'

describe('dry-run-store', () => {
  beforeEach(() => {
    resetDryRunStore()
  })

  const body = {
    name: 'Desk Cat',
    ticker: 'DCAT',
    mode: 'agent',
    initialBuySol: 0,
    autoHire: { seats: 3 },
  }

  it('hashes launch bodies stably', () => {
    expect(hashLaunchBody(body)).toBe(hashLaunchBody({ ...body }))
    expect(hashLaunchBody(body)).not.toBe(hashLaunchBody({ ...body, ticker: 'OTHER' }))
  })

  it('requires approval before consume', () => {
    const rec = createDryRun({ apiKeyFp: 'fp1', body, plan: { ok: true } })
    expect(getDryRun(rec.id)?.approvedAt).toBeNull()
    expect(() =>
      consumeApprovedDryRun({ dryRunId: rec.id, apiKeyFp: 'fp1', body }),
    ).toThrow(/not approved/)
    approveDryRun(rec.id, rec.approveToken)
    const used = consumeApprovedDryRun({ dryRunId: rec.id, apiKeyFp: 'fp1', body })
    expect(used.consumedAt).toBeTruthy()
    expect(() =>
      consumeApprovedDryRun({ dryRunId: rec.id, apiKeyFp: 'fp1', body }),
    ).toThrow(/already used/)
  })

  it('rejects wrong approve token and mismatched body', () => {
    const rec = createDryRun({ apiKeyFp: 'fp1', body, plan: { ok: true } })
    expect(() => approveDryRun(rec.id, 'bad-token')).toThrow(/Invalid approval/)
    approveDryRun(rec.id, rec.approveToken)
    expect(() =>
      consumeApprovedDryRun({
        dryRunId: rec.id,
        apiKeyFp: 'fp1',
        body: { ...body, ticker: 'OTHER' },
      }),
    ).toThrow(/does not match/)
  })
})
