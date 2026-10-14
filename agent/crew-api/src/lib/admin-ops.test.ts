import { describe, expect, it } from 'vitest'
import { classifyAgentChannel, emptyChannelCounts, tallyLaunchChannels } from './admin-ops.js'
import { authorizeAdminOps } from './admin-ops-auth.js'
import type { Request } from 'express'

function mockReq(headers: Record<string, string> = {}): Request {
  return {
    header(name: string) {
      return headers[name.toLowerCase()] || headers[name] || undefined
    },
    query: {},
    body: {},
  } as unknown as Request
}

describe('classifyAgentChannel', () => {
  it('maps labels to integration buckets', () => {
    expect(classifyAgentChannel('my eliza bot')).toBe('elizaos')
    expect(classifyAgentChannel('ACP worker')).toBe('acp')
    expect(classifyAgentChannel('x402 desk')).toBe('x402')
    expect(classifyAgentChannel('crew agent')).toBe('mcp')
  })
})

describe('tallyLaunchChannels', () => {
  it('counts launches with no agent_key_id as direct, not x402', () => {
    expect(
      tallyLaunchChannels([
        { agent_key_id: null, label: null, n: 12 },
        { agent_key_id: '', label: 'x402 desk', n: 3 },
      ]),
    ).toEqual({ ...emptyChannelCounts(), direct: 15 })
  })

  it('leaves x402 at 0 when no keyed launch is labeled x402', () => {
    expect(
      tallyLaunchChannels([
        { agent_key_id: 'ak_1', label: 'crew agent', n: 4 },
        { agent_key_id: 'ak_2', label: 'ACP worker', n: 2 },
        { agent_key_id: 'ak_3', label: 'my eliza bot', n: 1 },
      ]),
    ).toEqual({ acp: 2, mcp: 4, x402: 0, elizaos: 1, direct: 0 })
  })

  it('counts x402 only from agent keys labeled as x402', () => {
    expect(
      tallyLaunchChannels([
        { agent_key_id: null, label: null, n: 9 },
        { agent_key_id: 'ak_x', label: 'x402 desk', n: 2 },
      ]),
    ).toEqual({ ...emptyChannelCounts(), direct: 9, x402: 2 })
  })
})

describe('authorizeAdminOps', () => {
  it('rejects without credentials in test env', () => {
    const res = authorizeAdminOps(mockReq())
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.status).toBe(401)
  })

  it('accepts admin token when configured', () => {
    const prev = process.env.ADMIN_TOKEN
    process.env.ADMIN_TOKEN = 'test-ops-secret'
    const res = authorizeAdminOps(mockReq({ 'x-crew-admin-token': 'test-ops-secret' }))
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.via).toBe('token')
    process.env.ADMIN_TOKEN = prev
  })
})
