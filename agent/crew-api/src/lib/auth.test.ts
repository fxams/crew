import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import type { Request, Response } from 'express'
import { requireAgentApiKey, requireApiKey } from './auth.js'

function mockReq(headers: Record<string, string> = {}): Request {
  return {
    header(name: string) {
      return headers[name.toLowerCase()] || headers[name] || undefined
    },
  } as unknown as Request
}

function mockRes() {
  const out: {
    statusCode?: number
    body?: unknown
    status: (n: number) => typeof out
    json: (b: unknown) => typeof out
  } = {
    status(n: number) {
      out.statusCode = n
      return out
    },
    json(b: unknown) {
      out.body = b
      return out
    },
  }
  return out as unknown as Response & { statusCode?: number; body?: unknown }
}

describe('auth middleware', () => {
  const saved = {
    NODE_ENV: process.env.NODE_ENV,
    CREW_API_KEY: process.env.CREW_API_KEY,
    CREW_AGENT_API_KEY: process.env.CREW_AGENT_API_KEY,
  }
  beforeEach(() => {
    process.env.NODE_ENV = 'production'
    process.env.CREW_API_KEY = 'board-key-aaaaaaaa'
    process.env.CREW_AGENT_API_KEY = 'agent-key-bbbbbbbb'
  })
  afterEach(() => {
    process.env.NODE_ENV = saved.NODE_ENV
    process.env.CREW_API_KEY = saved.CREW_API_KEY
    process.env.CREW_AGENT_API_KEY = saved.CREW_AGENT_API_KEY
  })

  it('accepts board key on requireApiKey', () => {
    const res = mockRes()
    let next = false
    requireApiKey(mockReq({ 'x-crew-api-key': 'board-key-aaaaaaaa' }), res, () => {
      next = true
    })
    expect(next).toBe(true)
  })

  it('rejects board key on agent routes when agent key is configured', () => {
    const res = mockRes() as Response & { statusCode?: number; body?: { error?: string } }
    let next = false
    requireAgentApiKey(mockReq({ 'x-crew-api-key': 'board-key-aaaaaaaa' }), res, () => {
      next = true
    })
    expect(next).toBe(false)
    expect(res.statusCode).toBe(401)
    expect(String(res.body?.error || '')).toMatch(/CREW_AGENT_API_KEY/)
  })

  it('accepts agent key on agent routes', () => {
    const res = mockRes()
    let next = false
    requireAgentApiKey(mockReq({ 'x-crew-api-key': 'agent-key-bbbbbbbb' }), res, () => {
      next = true
    })
    expect(next).toBe(true)
  })
})
