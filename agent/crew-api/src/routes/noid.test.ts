import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApiApp } from '../api-app.js'
import { resetNoidKitForTests } from '../lib/noid-kit.js'

describe('noid HTTP', () => {
  const prev = {
    NOID_KIT_ENABLED: process.env.NOID_KIT_ENABLED,
    NOID_KIT_API_KEY: process.env.NOID_KIT_API_KEY,
    CREW_AGENT_API_KEY: process.env.CREW_AGENT_API_KEY,
    NODE_ENV: process.env.NODE_ENV,
  }

  beforeEach(() => {
    resetNoidKitForTests()
    delete process.env.NOID_KIT_ENABLED
    delete process.env.NOID_KIT_API_KEY
    process.env.CREW_AGENT_API_KEY = 'agent-test-key-aaaaaaaa'
    process.env.NODE_ENV = 'test'
  })

  afterEach(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
    resetNoidKitForTests()
  })

  it('GET /api/noid is public and has the connect snippet', async () => {
    const app = createApiApp()
    const res = await request(app).get('/api/noid')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.site).toBe('https://noid-agent-kit.onrender.com')
    expect(res.body.mcp).toBe('https://noid-agent-kit.onrender.com/mcp')
    expect(res.body.enabled).toBe(false)
    expect(res.body.proxyEnabled).toBe(false)
    expect(res.body.connect.snippet).toContain('nak_YOUR_KEY')
    expect(res.body.tools).toContain('create_invoice')
    expect(res.body.pay.creditUsd).toBe(0.01)
    expect(res.body.affiliation).toMatch(/Not affiliated/)
    expect(JSON.stringify(res.body).toLowerCase()).not.toMatch(
      /guaranteed|roi|noidpad|official|partnership/,
    )
  })

  it('GET /api/noid/whale-moves is 503 when the flag is off', async () => {
    const app = createApiApp()
    const res = await request(app)
      .get('/api/noid/whale-moves')
      .set('x-crew-api-key', 'agent-test-key-aaaaaaaa')
    expect(res.status).toBe(503)
    expect(res.body.ok).toBe(false)
    expect(res.body.page).toBe('https://crewpay.dev/noid')
  })

  it('GET /api/noid/new-tokens is 503 when the flag is off', async () => {
    const app = createApiApp()
    const res = await request(app)
      .get('/api/noid/new-tokens')
      .set('x-crew-api-key', 'agent-test-key-aaaaaaaa')
    expect(res.status).toBe(503)
    expect(res.body.ok).toBe(false)
    expect(res.body.site).toBe('https://noid-agent-kit.onrender.com')
  })
})
