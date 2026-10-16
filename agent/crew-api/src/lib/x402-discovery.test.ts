import { afterEach, describe, expect, it } from 'vitest'
import { CREWPAY_USE_CASE, X402_NETWORK_BASE, bazaarExtensionFor, paidX402Routes, wellKnownX402 } from './x402-discovery.js'
import { usdToUsdcAtomic, x402PriceAutohireUsd, x402PriceLaunchUsd } from './x402.js'
import { openApiSpec, wellKnownX402 as discoveryWellKnown } from './agent/discovery.js'

const saved = { ...process.env }

afterEach(() => {
  for (const key of ['X402_PRICE_LAUNCH_USD', 'X402_PRICE_AUTOHIRE_USD', 'CREW_API_PUBLIC_URL'] as const) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
})

describe('x402 bazaar + well-known discovery', () => {
  it('lists every existing paid route with bazaar info + JSON Schema', () => {
    const routes = paidX402Routes()
    expect(routes.map((r) => r.path)).toEqual([
      '/api/agent/autohire',
      '/api/agent/launch/unsigned',
      '/api/agent/launch/submit',
      '/api/agent/launch/dry-run',
      '/api/agent/launch',
    ])
    for (const route of routes) {
      expect(route.description).toContain(CREWPAY_USE_CASE)
      expect(route.description.toLowerCase()).not.toMatch(/guaranteed/)
      expect(route.description.toLowerCase()).not.toMatch(/later, agents/)
      expect(route.description.toLowerCase()).not.toMatch(/earnings promise/)
      expect(route.description.toLowerCase()).not.toMatch(/partnership claim/)
      expect(route.description.toLowerCase()).not.toMatch(/buyback cron/)
      expect(route.description.toLowerCase()).not.toMatch(/fee desk/)
      const ext = bazaarExtensionFor(route)
      expect(ext.info.description).toBe(route.description)
      expect(ext.info.input).toMatchObject({ type: 'http', method: 'POST', bodyType: 'json' })
      expect(ext.info.output.type).toBe('json')
      expect(ext.schema.$schema).toContain('2020-12')
      expect(ext.schema.properties).toBeTruthy()
      const input = (ext.schema.properties as { input: { properties: { body: unknown } } }).input
      expect(input.properties.body).toBeTruthy()
    }
  })

  it('emits /.well-known/x402 with the use case and absolute resource URLs', () => {
    const doc = wellKnownX402({
      apiUrl: 'https://api.crewpay.dev',
      launchUsd: 0.1,
      autohireUsd: 0.02,
      solanaUsdc: true,
    })
    expect(doc.version).toBe(1)
    expect(doc.description).toBe(CREWPAY_USE_CASE)
    expect(doc.contact.email).toBe('crewpay@mail.grokbot.com')
    expect(doc.instructions).toContain('eip155:8453')
    expect(doc.instructions).toContain('X402_SOLANA_PAY_TO')
    expect(doc.instructions).toContain('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp')
    expect(doc.instructions.toLowerCase()).not.toMatch(/later, agents/)
    expect(doc.instructions.toLowerCase()).not.toMatch(/buyback cron/)
    expect(doc.instructions).toContain('not an x402 resource server')
    expect(doc.resources).toEqual([
      'https://api.crewpay.dev/api/agent/autohire',
      'https://api.crewpay.dev/api/agent/launch/unsigned',
      'https://api.crewpay.dev/api/agent/launch/submit',
      'https://api.crewpay.dev/api/agent/launch/dry-run',
      'https://api.crewpay.dev/api/agent/launch',
    ])
    expect(doc.openapi).toBe('https://api.crewpay.dev/openapi.json')
  })

  it('wires OpenAPI info.description, x-payment-info, and 402 on paid ops', () => {
    const spec = openApiSpec() as {
      info: { description: string; contact: { email?: string } }
      'x-discovery': { x402: string }
      paths: Record<string, { post?: Record<string, unknown> }>
    }
    expect(spec.info.description).toBe(CREWPAY_USE_CASE)
    expect(spec.info.contact.email).toBe('crewpay@mail.grokbot.com')
    expect(spec.info.description.toLowerCase()).not.toMatch(/buyback cron/)
    expect(spec.info.description.toLowerCase()).not.toMatch(/fee desk/)
    expect(spec.info.description.toLowerCase()).not.toMatch(/later, agents/)
    expect(spec['x-discovery'].x402).toContain('/.well-known/x402')
    const autohire = spec.paths['/api/agent/autohire']?.post as {
      'x-payment-info': { protocols: string[]; price: { mode: string; currency: string; amount: string } }
      responses: { '402': unknown }
    }
    expect(autohire['x-payment-info']).toEqual({
      protocols: ['x402'],
      price: { mode: 'fixed', currency: 'USD', amount: x402PriceAutohireUsd().toFixed(2) },
    })
    expect(autohire.responses['402']).toBeTruthy()
    const unsigned = spec.paths['/api/agent/launch/unsigned']?.post as {
      'x-payment-info': { price: { amount: string } }
    }
    expect(unsigned['x-payment-info'].price.amount).toBe(x402PriceLaunchUsd().toFixed(2))
    const wk = discoveryWellKnown()
    expect(wk.resources[0]).toMatch(/^https:\/\/api\.crewpay\.dev\/api\/agent\/autohire$/)
    expect(usdToUsdcAtomic(0.02)).toBe('20000')
    expect(X402_NETWORK_BASE).toBe('eip155:8453')
  })
})
