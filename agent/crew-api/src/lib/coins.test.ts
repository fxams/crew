import { describe, expect, it } from 'vitest'

describe('crew-api smoke', () => {
  it('loads zod coin shape constraints', async () => {
    const { z } = await import('zod')
    const mode = z.enum(['split', 'buyback', 'raid', 'agent'])
    expect(mode.parse('split')).toBe('split')
  })
})
