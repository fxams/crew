import { describe, expect, it } from 'vitest'
import { classifyAgentChannel } from './admin-ops.js'
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
