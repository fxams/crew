import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { errorIssues, errorMessage, normalizeAutoHireInput } from './errors.js'
import { agentUnauthorizedBody, readAgentKeyHeader } from '../auth.js'

const hdr = (h: Record<string, string>) => ({ header: (n: string) => h[n.toLowerCase()] })

describe('agent DX errors', () => {
  it('formats zod errors as readable text + issues', () => {
    const schema = z.object({ name: z.string().min(2), imageUrl: z.string().url() })
    const r = schema.safeParse({ name: 'x' })
    expect(r.success).toBe(false)
    const msg = errorMessage(r.error)
    expect(msg).toMatch(/^Invalid request — /)
    expect(msg).toContain('name:')
    expect(msg).toContain('imageUrl:')
    expect(msg).not.toContain('"code"')
    expect(errorIssues(r.error)?.map((i) => i.path)).toEqual(['name', 'imageUrl'])
    expect(errorIssues(new Error('x'))).toBeUndefined()
    expect(errorMessage(new Error('boom'))).toBe('boom')
    expect(errorMessage('nope', 'fallback')).toBe('fallback')
  })

  it('accepts autoHire true / false / number / object', () => {
    expect(normalizeAutoHireInput(true)).toEqual({ seats: 5 })
    expect(normalizeAutoHireInput(false)).toBeUndefined()
    expect(normalizeAutoHireInput(3)).toEqual({ seats: 3 })
    expect(normalizeAutoHireInput({ seats: 4 })).toEqual({ seats: 4 })
    expect(normalizeAutoHireInput(undefined)).toBeUndefined()
  })

  it('reads key from x-crew-api-key, Bearer, or x-api-key', () => {
    expect(readAgentKeyHeader(hdr({ 'x-crew-api-key': ' crew_ak_a ' }))).toBe('crew_ak_a')
    expect(readAgentKeyHeader(hdr({ authorization: 'Bearer crew_ak_b' }))).toBe('crew_ak_b')
    expect(readAgentKeyHeader(hdr({ authorization: 'bearer   crew_ak_c' }))).toBe('crew_ak_c')
    expect(readAgentKeyHeader(hdr({ 'x-api-key': 'crew_ak_d' }))).toBe('crew_ak_d')
    expect(readAgentKeyHeader(hdr({ authorization: 'Basic abc' }))).toBe('')
    expect(
      readAgentKeyHeader(hdr({ 'x-crew-api-key': 'crew_ak_a', authorization: 'Bearer crew_ak_b' })),
    ).toBe('crew_ak_a')
  })

  it('401 body tells agents how to get a key and never echoes the key', () => {
    const b = agentUnauthorizedBody(false)
    expect(b.fix).toContain('/api/agent/keys/claim')
    expect(JSON.stringify(agentUnauthorizedBody(true))).not.toContain('crew_ak_')
  })
})
