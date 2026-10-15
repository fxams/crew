import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Request, Response } from 'express'
import { deskWalletFromAuth, requireAgentApiKeyOrX402, x402AuthContext } from './x402-auth.js'
import { PAYMENT_REQUIRED_HEADER, setX402FacilitatorForTests, type PaymentPayload } from './x402.js'
import { CREWPAY_USE_CASE, X402_NETWORK_BASE } from './x402-discovery.js'

const EVM = '0x2222222222222222222222222222222222222222'
const SOL = 'DKqEbHvb7KHSdChzF54KTdj6io4dVZvbieFEMcS1C5cw'
const AGENT_KEY = 'agent-key-bbbbbbbb'

function mockReq(headers: Record<string, string> = {}, path = '/agent/launch/unsigned'): Request {
  const lower: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v
  return {
    header(name: string) {
      return lower[name.toLowerCase()]
    },
    path,
    originalUrl: `/api${path}`,
    url: path,
  } as unknown as Request
}

function mockRes() {
  const headers: Record<string, string> = {}
  const out: {
    statusCode?: number
    body?: unknown
    headers: Record<string, string>
    status: (n: number) => typeof out
    json: (b: unknown) => typeof out
    setHeader: (k: string, v: string) => void
    getHeader: (k: string) => string | undefined
  } = {
    headers,
    status(n: number) {
      out.statusCode = n
      return out
    },
    json(b: unknown) {
      out.body = b
      return out
    },
    setHeader(k: string, v: string) {
      headers[k] = v
    },
    getHeader(k: string) {
      return headers[k]
    },
  }
  return out as unknown as Response & typeof out
}

function b64(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64')
}

const saved = {
  NODE_ENV: process.env.NODE_ENV,
  CREW_API_KEY: process.env.CREW_API_KEY,
  CREW_AGENT_API_KEY: process.env.CREW_AGENT_API_KEY,
  DATABASE_URL: process.env.DATABASE_URL,
  X402_ENABLED: process.env.X402_ENABLED,
  X402_PAY_TO_EVM: process.env.X402_PAY_TO_EVM,
  X402_PAY_TO_SOL: process.env.X402_PAY_TO_SOL,
}

describe('requireAgentApiKeyOrX402', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'production'
    process.env.CREW_API_KEY = 'board-key-aaaaaaaa'
    process.env.CREW_AGENT_API_KEY = AGENT_KEY
    delete process.env.DATABASE_URL
    delete process.env.X402_ENABLED
    delete process.env.X402_PAY_TO_EVM
    delete process.env.X402_PAY_TO_SOL
    setX402FacilitatorForTests(null)
  })
  afterEach(() => {
    process.env.NODE_ENV = saved.NODE_ENV
    process.env.CREW_API_KEY = saved.CREW_API_KEY
    process.env.CREW_AGENT_API_KEY = saved.CREW_AGENT_API_KEY
    if (saved.DATABASE_URL) process.env.DATABASE_URL = saved.DATABASE_URL
    else delete process.env.DATABASE_URL
    if (saved.X402_ENABLED) process.env.X402_ENABLED = saved.X402_ENABLED
    else delete process.env.X402_ENABLED
    if (saved.X402_PAY_TO_EVM) process.env.X402_PAY_TO_EVM = saved.X402_PAY_TO_EVM
    else delete process.env.X402_PAY_TO_EVM
    if (saved.X402_PAY_TO_SOL) process.env.X402_PAY_TO_SOL = saved.X402_PAY_TO_SOL
    else delete process.env.X402_PAY_TO_SOL
    setX402FacilitatorForTests(null)
  })

  it('keeps API-key auth unchanged when x402 is off', async () => {
    const res = mockRes()
    let next = false
    await requireAgentApiKeyOrX402(mockReq({ 'x-crew-api-key': AGENT_KEY }), res, () => {
      next = true
    })
    expect(next).toBe(true)
    expect(res.statusCode).toBeUndefined()
  })

  it('still 401s without a key when x402 is off', async () => {
    const res = mockRes()
    let next = false
    await requireAgentApiKeyOrX402(mockReq(), res, () => {
      next = true
    })
    expect(next).toBe(false)
    expect(res.statusCode).toBe(401)
  })

  it('returns 402 Payment Required with accepts[] when enabled and unpaid', async () => {
    process.env.X402_ENABLED = '1'
    process.env.X402_PAY_TO_EVM = EVM
    process.env.X402_PAY_TO_SOL = SOL
    const res = mockRes()
    let next = false
    await requireAgentApiKeyOrX402(mockReq(), res, () => {
      next = true
    })
    expect(next).toBe(false)
    expect(res.statusCode).toBe(402)
    const body = res.body as {
      x402Version?: number
      accepts?: { network: string; amount?: string; maxAmountRequired?: string; payTo?: string }[]
      extensions?: { bazaar?: { info?: { description?: string; input?: { type?: string } }; schema?: unknown } }
      resource?: { url?: string; description?: string; serviceName?: string }
    }
    expect(body.x402Version).toBe(2)
    expect(body.accepts?.map((a) => a.network).sort()).toEqual([
      X402_NETWORK_BASE,
      'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
    ])
    expect(body.accepts?.[0]?.amount).toMatch(/^\d+$/)
    expect(body.accepts?.[0]?.amount).toBe(body.accepts?.[0]?.maxAmountRequired)
    expect(body.accepts?.[0]?.payTo).toBe(EVM)
    expect(body.resource?.serviceName).toBe('CrewPay')
    expect(body.resource?.description).toContain('Pump.fun')
    expect(body.extensions?.bazaar?.info?.description).toContain(CREWPAY_USE_CASE.slice(0, 40))
    expect(body.extensions?.bazaar?.info?.input?.type).toBe('http')
    expect(body.extensions?.bazaar?.schema).toBeTruthy()
    expect(res.headers[PAYMENT_REQUIRED_HEADER]).toMatch(/^[A-Za-z0-9+/=]+$/)
    const fromHeader = JSON.parse(
      Buffer.from(res.headers[PAYMENT_REQUIRED_HEADER], 'base64').toString('utf8'),
    ) as { x402Version: number }
    expect(fromHeader.x402Version).toBe(2)
  })

  it('accepts a valid API key even when x402 is enabled (no payment)', async () => {
    process.env.X402_ENABLED = '1'
    process.env.X402_PAY_TO_EVM = EVM
    const res = mockRes()
    const req = mockReq({ 'x-crew-api-key': AGENT_KEY })
    let next = false
    await requireAgentApiKeyOrX402(req, res, () => {
      next = true
    })
    expect(next).toBe(true)
    expect(req.crewAgentAuth?.source).toBe('env')
  })

  it('verifies and settles X-PAYMENT via mocked facilitator', async () => {
    process.env.X402_ENABLED = '1'
    process.env.X402_PAY_TO_EVM = EVM
    setX402FacilitatorForTests({
      async verify() {
        return { isValid: true, payer: EVM }
      },
      async settle() {
        return { success: true, transaction: '0xsettle', network: 'base', payer: EVM }
      },
    })
    const payload: PaymentPayload = {
      x402Version: 1,
      scheme: 'exact',
      network: 'base',
      payload: { authorization: { from: EVM } },
    }
    const res = mockRes()
    const req = mockReq({ 'X-PAYMENT': b64(payload) })
    let next = false
    await requireAgentApiKeyOrX402(req, res, () => {
      next = true
    })
    expect(next).toBe(true)
    expect(req.crewAgentAuth?.source).toBe('x402')
    expect(req.crewAgentAuth?.payerWallet).toBe(EVM)
    expect(res.headers['X-PAYMENT-RESPONSE']).toBeTruthy()
  })

  it('returns 402 when the mocked facilitator rejects the payment', async () => {
    process.env.X402_ENABLED = '1'
    process.env.X402_PAY_TO_EVM = EVM
    setX402FacilitatorForTests({
      async verify() {
        return { isValid: false, invalidReason: 'insufficient funds' }
      },
      async settle() {
        return { success: false }
      },
    })
    const payload: PaymentPayload = {
      x402Version: 1,
      scheme: 'exact',
      network: 'base',
      payload: { authorization: { from: EVM } },
    }
    const res = mockRes()
    let next = false
    await requireAgentApiKeyOrX402(mockReq({ 'X-PAYMENT': b64(payload) }), res, () => {
      next = true
    })
    expect(next).toBe(false)
    expect(res.statusCode).toBe(402)
    expect(JSON.stringify(res.body)).toMatch(/insufficient funds/)
  })
})

describe('deskWalletFromAuth', () => {
  it('uses the Solana payer as the 15% launching-agent wallet', () => {
    const auth = x402AuthContext(SOL, {
      scheme: 'exact',
      network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
      amount: '1',
      maxAmountRequired: '1',
      payTo: SOL,
      maxTimeoutSeconds: 60,
      asset: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    })
    expect(deskWalletFromAuth(auth, '11111111111111111111111111111111', 'solana')).toBe(SOL)
    expect(deskWalletFromAuth(auth, EVM, 'evm')).toBe(EVM)
  })

  it('does not put an EVM payer into a Solana fee map', () => {
    const auth = x402AuthContext(EVM, {
      scheme: 'exact',
      network: X402_NETWORK_BASE,
      amount: '1',
      maxAmountRequired: '1',
      payTo: EVM,
      maxTimeoutSeconds: 60,
      asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    })
    expect(deskWalletFromAuth(auth, SOL, 'solana')).toBe(SOL)
    expect(deskWalletFromAuth(auth, '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'evm')).toBe(EVM)
  })
})
