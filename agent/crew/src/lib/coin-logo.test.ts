import { describe, expect, it } from 'vitest'
import { CREW_AGENT_API_URL } from './config'
import { coinLogoSrc } from './coin-logo'

describe('coinLogoSrc', () => {
  it('points at the API logo proxy for a mint', () => {
    const mint = 'So11111111111111111111111111111111111111112'
    expect(coinLogoSrc(mint)).toBe(`${CREW_AGENT_API_URL}/api/coins/${mint}/logo`)
    expect(coinLogoSrc(mint)).not.toMatch(/ipfs\.io|dweb\.link/)
  })
})
