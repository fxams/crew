import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  USDC_BASE,
  USDC_SOLANA,
  createHttpFacilitator,
  decodePaymentHeader,
  encodePaymentResponse,
  extractPayerFromPayload,
  formatUsdPrice,
  matchRequirements,
  paymentRequirementsFor,
  setX402FacilitatorForTests,
  usdToUsdcAtomic,
  x402Enabled,
  x402FacilitatorUrl,
  x402PayToEvm,
  x402PublicDiscovery,
  x402Ready,
  type PaymentPayload,
  type PaymentRequirements,
} from './x402.js'

const EVM = '0x1111111111111111111111111111111111111111'
const SOL = 'DKqEbHvb7KHSdChzF54KTdj6io4dVZvbieFEMcS1C5cw'

const saved = { ...process.env }

function resetEnv() {
  for (const key of [
    'X402_ENABLED',
    'X402_FACILITATOR_URL',
    'X402_PAY_TO_EVM',
    'X402_PAY_TO_SOL',
    'X402_PRICE_LAUNCH_USD',
    'X402_PRICE_AUTOHIRE_USD',
    'ZORA_TREASURY_ADDRESS',
    'CREW_BUYBACK_WALLET_EVM',
  ]) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
  setX402FacilitatorForTests(null)
}

afterEach(() => {
  resetEnv()
})

function b64(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64')
}

describe('x402 config', () => {
  it('is off unless X402_ENABLED', () => {
    delete process.env.X402_ENABLED
    process.env.X402_PAY_TO_EVM = EVM
    expect(x402Enabled()).toBe(false)
    expect(x402Ready()).toBe(false)
    expect(x402PublicDiscovery().enabled).toBe(false)
    expect(x402PublicDiscovery().feeMap.toLowerCase()).not.toMatch(/launcher gets 60/)
  })

  it('defaults payTo EVM from ZORA_TREASURY_ADDRESS', () => {
    process.env.X402_ENABLED = '1'
    delete process.env.X402_PAY_TO_EVM
    process.env.ZORA_TREASURY_ADDRESS = EVM
    expect(x402PayToEvm()).toBe(EVM)
    expect(x402Ready()).toBe(true)
  })

  it('defaults facilitator URL to the public x402 facilitator', () => {
    delete process.env.X402_FACILITATOR_URL
    expect(x402FacilitatorUrl()).toBe('https://x402.org/facilitator')
  })

  it('builds Base + Solana USDC requirements from env prices', () => {
    process.env.X402_ENABLED = '1'
    process.env.X402_PAY_TO_EVM = EVM
    process.env.X402_PAY_TO_SOL = SOL
    process.env.X402_PRICE_LAUNCH_USD = '0.10'
    const reqs = paymentRequirementsFor({
      resource: 'https://api.crewpay.dev/api/agent/launch/unsigned',
      kind: 'launch',
    })
    expect(reqs).toHaveLength(2)
    expect(reqs[0]).toMatchObject({
      scheme: 'exact',
      network: 'base',
      payTo: EVM,
      asset: USDC_BASE,
      maxAmountRequired: usdToUsdcAtomic(0.1),
    })
    expect(reqs[1]).toMatchObject({
      scheme: 'exact',
      network: 'solana',
      payTo: SOL,
      asset: USDC_SOLANA,
    })
    expect(formatUsdPrice(0.1)).toBe('$0.10')
  })
})

describe('x402 payment header', () => {
  it('round-trips X-PAYMENT payload and extracts payer', () => {
    const payload: PaymentPayload = {
      x402Version: 1,
      scheme: 'exact',
      network: 'base',
      payload: {
        signature: '0xsig',
        authorization: { from: EVM, to: EVM, value: '100000' },
      },
    }
    const decoded = decodePaymentHeader(b64(payload))
    expect(decoded.network).toBe('base')
    expect(extractPayerFromPayload(decoded)).toBe(EVM)
  })

  it('matches network in accepts[]', () => {
    const accepts: PaymentRequirements[] = [
      {
        scheme: 'exact',
        network: 'base',
        maxAmountRequired: '100000',
        resource: 'https://api.crewpay.dev/x',
        description: 'test',
        mimeType: 'application/json',
        payTo: EVM,
        maxTimeoutSeconds: 60,
        asset: USDC_BASE,
      },
    ]
    expect(
      matchRequirements(
        { x402Version: 1, scheme: 'exact', network: 'base', payload: {} },
        accepts,
      )?.network,
    ).toBe('base')
    expect(
      matchRequirements(
        { x402Version: 1, scheme: 'exact', network: 'solana', payload: {} },
        accepts,
      ),
    ).toBeNull()
  })
})

describe('HTTP facilitator (mocked fetch)', () => {
  it('posts /verify and /settle', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const u = String(url)
      if (u.endsWith('/verify')) {
        return new Response(JSON.stringify({ isValid: true, payer: EVM }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (u.endsWith('/settle')) {
        return new Response(
          JSON.stringify({
            success: true,
            transaction: '0xabc',
            network: 'base',
            payer: EVM,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      return new Response('not found', { status: 404 })
    }) as unknown as typeof fetch

    const fac = createHttpFacilitator('https://facilitator.test', fetchImpl)
    const payload: PaymentPayload = {
      x402Version: 1,
      scheme: 'exact',
      network: 'base',
      payload: { authorization: { from: EVM } },
    }
    process.env.X402_PAY_TO_EVM = EVM
    const accepts = paymentRequirementsFor({
      resource: 'https://api.crewpay.dev/api/agent/launch/unsigned',
      kind: 'launch',
    })
    const verified = await fac.verify(payload, accepts[0]!)
    expect(verified.isValid).toBe(true)
    expect(verified.payer).toBe(EVM)
    const settled = await fac.settle(payload, accepts[0]!)
    expect(settled.success).toBe(true)
    expect(encodePaymentResponse(settled)).toMatch(/^[A-Za-z0-9+/=]+$/)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(String(fetchImpl.mock.calls[0][0])).toBe('https://facilitator.test/verify')
    expect(String(fetchImpl.mock.calls[1][0])).toBe('https://facilitator.test/settle')
  })
})
