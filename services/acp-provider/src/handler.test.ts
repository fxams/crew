import { describe, expect, it, vi } from 'vitest'
import { loadConfig } from './config.js'
import { createEntryHandler, payingAgentWallet, type JobSession } from './handler.js'

const PAYER = '0x1111111111111111111111111111111111111111'

function mockSession(partial: Partial<JobSession> = {}): JobSession {
  return {
    jobId: 7,
    chainId: 84532,
    status: 'open',
    job: { description: 'crewpay_autohire_kol_crew', clientAddress: PAYER },
    entries: [],
    setBudget: vi.fn().mockResolvedValue(undefined),
    submit: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    ...partial,
  }
}

const autohireReq = {
  mint: 'So11111111111111111111111111111111111111112',
  platform: 'pumpfun' as const,
  budget: 5,
}

describe('ACP job lifecycle', () => {
  it('validates requirement then setBudget; skips budget on invalid schema', async () => {
    const config = loadConfig({ ...process.env, ACP_ENABLED: '' })
    const usdc = vi.fn((amount: number, chainId: number) => ({ amount, chainId, symbol: 'USDC' }))
    const fulfillment = {
      autohire: vi.fn(),
      launch: vi.fn(),
    }
    const onEntry = createEntryHandler({ config, fulfillment, assetToken: { usdc } })

    const session = mockSession()
    await onEntry(session, {
      kind: 'message',
      contentType: 'requirement',
      content: JSON.stringify(autohireReq),
    })
    expect(session.setBudget).toHaveBeenCalledTimes(1)
    expect(usdc).toHaveBeenCalledWith(0.25, 84532)
    expect(session.sendMessage).not.toHaveBeenCalled()

    const bad = mockSession()
    await onEntry(bad, {
      kind: 'message',
      contentType: 'requirement',
      content: JSON.stringify({ platform: 'pumpfun' }),
    })
    expect(bad.setBudget).not.toHaveBeenCalled()
    expect(bad.sendMessage).toHaveBeenCalledTimes(1)
    expect(String(vi.mocked(bad.sendMessage).mock.calls[0][0])).toMatch(/Invalid/)
  })

  it('on job.funded calls Autohire then submit; paying wallet is identity', async () => {
    const config = loadConfig()
    const crew = { ok: true, crew: [{ handle: '@owl', wallet: 'So111', share: 100 }], identity: PAYER }
    const fulfillment = {
      autohire: vi.fn().mockResolvedValue(crew),
      launch: vi.fn(),
    }
    const onEntry = createEntryHandler({
      config,
      fulfillment,
      assetToken: { usdc: (n, c) => ({ n, c }) },
    })
    const session = mockSession()
    await onEntry(session, {
      kind: 'message',
      contentType: 'requirement',
      content: JSON.stringify(autohireReq),
      from: PAYER,
    })
    session.status = 'funded'
    await onEntry(session, { kind: 'system', event: { type: 'job.funded' } })
    expect(fulfillment.autohire).toHaveBeenCalledTimes(1)
    expect(fulfillment.autohire.mock.calls[0][1]).toEqual({
      payerWallet: PAYER,
      offering: 'crewpay_autohire_kol_crew',
    })
    expect(session.submit).toHaveBeenCalledWith(JSON.stringify(crew))
    expect(session.sendMessage).not.toHaveBeenCalled()
  })

  it('on fulfill error messages and does not submit', async () => {
    const config = loadConfig()
    const fulfillment = {
      autohire: vi.fn().mockRejectedValue(new Error('no KOLs matched')),
      launch: vi.fn(),
    }
    const onEntry = createEntryHandler({
      config,
      fulfillment,
      assetToken: { usdc: (n) => n },
    })
    const session = mockSession()
    await onEntry(session, {
      kind: 'message',
      contentType: 'requirement',
      content: JSON.stringify(autohireReq),
    })
    session.status = 'funded'
    await onEntry(session, { kind: 'system', event: { type: 'job.funded' } })
    expect(session.submit).not.toHaveBeenCalled()
    expect(session.sendMessage).toHaveBeenCalledTimes(1)
    expect(String(vi.mocked(session.sendMessage).mock.calls[0][0])).toMatch(/no KOLs matched/)
  })

  it('builds unsigned launch deliverable and keeps submit-signed instructions', async () => {
    const config = loadConfig()
    const unsigned = {
      ok: true,
      steps: [{ kind: 'create', messageBase64: 'AAA' }],
      submitSigned: { tool: 'crew_submit_signed', http: 'POST /api/agent/launch/submit' },
      feeMap: '60% hired KOL crew / 15% launching agent / rest treasury',
    }
    const fulfillment = {
      autohire: vi.fn(),
      launch: vi.fn().mockResolvedValue(unsigned),
    }
    const onEntry = createEntryHandler({
      config,
      fulfillment,
      assetToken: { usdc: (n) => n },
    })
    const session = mockSession({
      job: { description: 'crewpay_launch_with_crew', clientAddress: PAYER },
    })
    await onEntry(session, {
      kind: 'message',
      contentType: 'requirement',
      content: JSON.stringify({
        name: 'Night Owl',
        ticker: 'HOOT',
        platform: 'pumpfun',
        launcherPubkey: 'So11111111111111111111111111111111111111112',
        imageUrl: 'https://example.com/hoot.png',
        autoHire: true,
      }),
    })
    expect(session.setBudget).toHaveBeenCalled()
    session.status = 'funded'
    await onEntry(session, { kind: 'system', event: { type: 'job.funded' } })
    expect(fulfillment.launch).toHaveBeenCalledTimes(1)
    expect(fulfillment.launch.mock.calls[0][1].payerWallet).toBe(PAYER)
    expect(session.submit).toHaveBeenCalledWith(JSON.stringify(unsigned))
  })

  it('reads paying agent wallet from the job client', () => {
    expect(
      payingAgentWallet(
        mockSession({ job: { description: 'x', clientAddress: PAYER } }),
      ),
    ).toBe(PAYER)
  })
})
