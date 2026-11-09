import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApiApp } from '../api-app.js'
import { resetCreativeMcpForTests } from '../lib/creative-mcp.js'

describe('creative HTTP', () => {
  const prev = {
    CREATIVE_MCP_ENABLED: process.env.CREATIVE_MCP_ENABLED,
    CREATIVE_MCP_API_KEY: process.env.CREATIVE_MCP_API_KEY,
    CREW_AGENT_API_KEY: process.env.CREW_AGENT_API_KEY,
    NODE_ENV: process.env.NODE_ENV,
  }

  beforeEach(() => {
    resetCreativeMcpForTests()
    delete process.env.CREATIVE_MCP_ENABLED
    delete process.env.CREATIVE_MCP_API_KEY
    process.env.CREW_AGENT_API_KEY = 'agent-test-key-aaaaaaaa'
    process.env.NODE_ENV = 'test'
  })

  afterEach(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
    resetCreativeMcpForTests()
  })

  it('GET /api/creative is public and has the connect snippet', async () => {
    const app = createApiApp()
    const res = await request(app).get('/api/creative')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.site).toBe('https://creative-mcp-40dj.onrender.com')
    expect(res.body.mcp).toBe('https://creative-mcp-40dj.onrender.com/mcp')
    expect(res.body.generateEnabled).toBe(false)
    expect(res.body.connect.snippet).toContain('lk_YOUR_KEY')
    expect(res.body.stills).toEqual(['logo', 'banner', 'meme'])
    expect(JSON.stringify(res.body).toLowerCase()).not.toMatch(/guaranteed|roi|qatar|deepcounterfeit/)
  })

  it('POST /api/coins/:mint/creative is 503 when the flag is off', async () => {
    const app = createApiApp()
    const res = await request(app)
      .post('/api/coins/So11111111111111111111111111111111111111112/creative')
      .set('x-crew-api-key', 'agent-test-key-aaaaaaaa')
      .send({ kind: 'logo' })
    expect(res.status).toBe(503)
    expect(res.body.ok).toBe(false)
    expect(res.body.page).toBe('https://crewpay.dev/creative')
  })
})
