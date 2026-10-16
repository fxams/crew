import { describe, expect, it } from 'vitest'
import { launchBodySchema, parseAgentStatusMint } from './launch-body.js'

const EVM_LAUNCHER = '0x1111111111111111111111111111111111111111'
const EVM_CREW = '0x2222222222222222222222222222222222222222'
const SOL_CREW = '11111111111111111111111111111111'

const baseClankerBody = {
  name: 'CPTEST',
  ticker: 'CPTEST',
  imageUrl: 'https://example.com/a.png',
  platform: 'clanker' as const,
  launcherPubkey: EVM_LAUNCHER,
  crew: [{ handle: 'kol1', wallet: EVM_CREW, share: 100 }],
}

describe('launchBodySchema', () => {
  it('accepts EVM crew and launcher for platform=clanker dry-run bodies', () => {
    const parsed = launchBodySchema.parse(baseClankerBody)
    expect(parsed.platform).toBe('clanker')
    expect(parsed.launcherPubkey).toBe(EVM_LAUNCHER)
    expect(parsed.crew?.[0]?.wallet).toBe(EVM_CREW)
  })

  it('rejects Solana crew wallets when platform=clanker', () => {
    expect(() =>
      launchBodySchema.parse({
        ...baseClankerBody,
        crew: [{ handle: 'kol1', wallet: SOL_CREW, share: 100 }],
      }),
    ).toThrow(/EVM address/)
  })

  it('rejects EVM launcher when platform=pumpfun', () => {
    expect(() =>
      launchBodySchema.parse({
        ...baseClankerBody,
        platform: 'pumpfun',
        launcherPubkey: EVM_LAUNCHER,
        crew: [{ handle: 'kol1', wallet: SOL_CREW, share: 100 }],
      }),
    ).toThrow()
  })
})

describe('parseAgentStatusMint', () => {
  it('accepts EVM token addresses for agent status', () => {
    const mint = '0x52c3f4ac350f0ddfae43a9fda7798bb6262535e9'
    expect(parseAgentStatusMint(mint)).toBe(mint)
    expect(parseAgentStatusMint(mint, 'clanker')).toBe(mint)
  })

  it('still parses Solana mints', () => {
    expect(parseAgentStatusMint(SOL_CREW)).toBe(SOL_CREW)
  })
})
