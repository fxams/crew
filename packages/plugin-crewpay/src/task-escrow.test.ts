import { describe, expect, it, vi, afterEach } from 'vitest'
import { CrewPayApiClient } from './client.js'
import { JobsEscrowBackend } from './task-escrow.js'

describe('JobsEscrowBackend', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('postTask routes to coin job endpoint', async () => {
    const fetchMock = vi.fn(async (_url: string) =>
      new Response(JSON.stringify({ ok: true, job: { id: 'j1' } }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const api = new CrewPayApiClient({ apiUrl: 'https://example.invalid', apiKey: 'k' })
    const backend = new JobsEscrowBackend(api)
    await backend.postTask({
      mint: 'Mint1234567890123456789012345678901234567890',
      template: 'meme-pack',
      chainId: 'solana-devnet',
      asset: 'SOL',
    })
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/jobs/coin')
  })

  it('payAgent calls payout endpoint', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, unsigned: { kind: 'transfer' } }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const api = new CrewPayApiClient({ apiUrl: 'https://example.invalid', apiKey: 'k' })
    const backend = new JobsEscrowBackend(api)
    const out = (await backend.payAgent('job-1', { from: 'wallet' })) as { payout?: { unsigned?: unknown } }
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/jobs/job-1/payout')
    expect(out.payout?.unsigned).toBeTruthy()
  })
})
