import { describe, expect, it } from 'vitest'
import { DEFAULT_API_URL, loadConfig } from './client.js'

describe('crew-mcp client', () => {
  it('defaults API URL', () => {
    const prev = process.env.CREW_API_URL
    delete process.env.CREW_API_URL
    expect(loadConfig().apiUrl).toBe(DEFAULT_API_URL)
    if (prev !== undefined) process.env.CREW_API_URL = prev
  })
})
