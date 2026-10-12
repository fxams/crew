import express from 'express'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import type { Request } from 'express'
import { resetRateLimits, takeRateLimit } from './agent/rate-limit.js'
import { clientIp, configureTrustProxy } from './client-ip.js'

function mockReq(opts: {
  ip?: string
  headers?: Record<string, string>
}): Request {
  const headers = opts.headers || {}
  return {
    ip: opts.ip,
    header(name: string) {
      const key = name.toLowerCase()
      return headers[key] || headers[name] || undefined
    },
  } as unknown as Request
}

describe('clientIp', () => {
  const saved = {
    CREW_TRUST_CF: process.env.CREW_TRUST_CF,
    CREW_TRUST_PROXY_HOPS: process.env.CREW_TRUST_PROXY_HOPS,
  }

  afterEach(() => {
    if (saved.CREW_TRUST_CF === undefined) delete process.env.CREW_TRUST_CF
    else process.env.CREW_TRUST_CF = saved.CREW_TRUST_CF
    if (saved.CREW_TRUST_PROXY_HOPS === undefined) delete process.env.CREW_TRUST_PROXY_HOPS
    else process.env.CREW_TRUST_PROXY_HOPS = saved.CREW_TRUST_PROXY_HOPS
  })

  it('uses CF-Connecting-IP when CREW_TRUST_CF=1 (ignores XFF)', () => {
    process.env.CREW_TRUST_CF = '1'
    expect(
      clientIp(
        mockReq({
          ip: '10.0.0.1',
          headers: {
            'cf-connecting-ip': '203.0.113.9',
            'x-forwarded-for': '198.51.100.1, 10.0.0.1',
          },
        }),
      ),
    ).toBe('203.0.113.9')
  })

  it('uses req.ip and never the left-most X-Forwarded-For', () => {
    delete process.env.CREW_TRUST_CF
    expect(
      clientIp(
        mockReq({
          ip: '203.0.113.50',
          headers: { 'x-forwarded-for': '198.51.100.1, 203.0.113.50' },
        }),
      ),
    ).toBe('203.0.113.50')
  })

  it('spoofed XFF header does not change the rate-limit bucket', async () => {
    delete process.env.CREW_TRUST_CF
    process.env.CREW_TRUST_PROXY_HOPS = '1'
    resetRateLimits()

    const app = express()
    configureTrustProxy(app)
    app.get('/bucket', (req, res) => {
      const ip = clientIp(req)
      const gate = takeRateLimit(`client-ip-test:${ip}`, { limit: 2, windowMs: 60_000 })
      res.json({ ip, ok: gate.ok })
    })

    const server = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s))
    })
    const { port } = server.address() as AddressInfo

    try {
      const hit = async (spoofLeft: string) => {
        const res = await fetch(`http://127.0.0.1:${port}/bucket`, {
          headers: { 'X-Forwarded-For': `${spoofLeft}, 203.0.113.10` },
        })
        return (await res.json()) as { ip: string; ok: boolean }
      }

      const a = await hit('198.51.100.1')
      const b = await hit('198.51.100.2')
      const c = await hit('198.51.100.3')

      expect(a.ip).toBe('203.0.113.10')
      expect(b.ip).toBe('203.0.113.10')
      expect(c.ip).toBe('203.0.113.10')
      expect(a.ok).toBe(true)
      expect(b.ok).toBe(true)
      // Third hit on the same real IP must share the bucket and be blocked.
      expect(c.ok).toBe(false)
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()))
      })
    }
  })

  it('configureTrustProxy skips trust proxy when CREW_TRUST_CF=1', () => {
    process.env.CREW_TRUST_CF = '1'
    const app = express()
    configureTrustProxy(app)
    expect(app.get('trust proxy')).toBe(false)
  })

  it('configureTrustProxy sets hop count from CREW_TRUST_PROXY_HOPS', () => {
    delete process.env.CREW_TRUST_CF
    process.env.CREW_TRUST_PROXY_HOPS = '2'
    const app = express()
    configureTrustProxy(app)
    expect(app.get('trust proxy')).toBe(2)
  })
})
