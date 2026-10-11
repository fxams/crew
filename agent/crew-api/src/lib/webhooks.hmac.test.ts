import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./db.js', () => {
  return {
    query: vi.fn(async () => ({
      rows: [{ id: 'wh_1', url: 'https://example.com/hook', secret: 'whsec_test', events: ['*'] }],
    })),
  }
})

const sent: { url?: string; opts?: any }[] = []
vi.mock('./agent/safe-url.js', async () => {
  return {
    fetchPublicUrl: vi.fn(async (url: string, opts: any) => {
      sent.push({ url, opts })
      return { ok: true, status: 200, headers: new Headers() } as unknown as Response
    }),
  }
})

import { createHmac } from 'node:crypto'
import { emitWebhookEvent, verifyWebhookSignature } from './webhooks.js'

describe('webhooks delivery + signature', () => {
  beforeEach(() => {
    sent.length = 0
  })

  it('sends POST with JSON body and HMAC with x-crew-timestamp', async () => {
    const payload = { mint: 'Mint11111111111111111111111111111111' }
    await emitWebhookEvent('launch.created', payload)
    expect(sent.length).toBe(1)
    const call = sent[0]!
    expect(call.url).toBe('https://example.com/hook')
    expect(call.opts?.method).toBe('POST')
    expect(typeof call.opts?.body).toBe('string')
    const body = call.opts.body as string
    const headers = call.opts?.headers as Record<string, string>
    const ts = String(headers['x-crew-timestamp'] || headers['X-Crew-Timestamp'])
    const sig = String(headers['x-crew-signature'] || headers['X-Crew-Signature'])
    const expected = createHmac('sha256', 'whsec_test').update(`${ts}.${body}`).digest('hex')
    expect(sig).toBe(expected)
    expect(verifyWebhookSignature('whsec_test', body, sig, ts)).toBe(true)
  })
})

