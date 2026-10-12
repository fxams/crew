import { describe, expect, it } from 'vitest'
import { COIN_JOB_TEMPLATE_IDS, COIN_JOB_TEMPLATES } from './coin-jobs'
import { coinMintFromPath, coinPagePath, isCoinPath } from './routes'

describe('coin job presets', () => {
  it('matches the four post-launch templates', () => {
    expect([...COIN_JOB_TEMPLATE_IDS]).toEqual([
      'meme-pack',
      'banner-logo',
      'x-upkeep',
      'website-polish',
    ])
    expect(COIN_JOB_TEMPLATES.map((t) => t.id)).toEqual([...COIN_JOB_TEMPLATE_IDS])
    expect(JSON.stringify(COIN_JOB_TEMPLATES).toLowerCase()).not.toMatch(/guaranteed/)
    expect(JSON.stringify(COIN_JOB_TEMPLATES).toLowerCase()).not.toMatch(/launcher gets 60/)
  })
})

describe('coin page routes', () => {
  it('parses /coin/<mint>', () => {
    const mint = 'So11111111111111111111111111111111111111112'
    expect(isCoinPath(`/coin/${mint}`)).toBe(true)
    expect(coinMintFromPath(`/coin/${mint}`)).toBe(mint)
    expect(coinMintFromPath(`/coin/${mint}/`)).toBe(mint)
    expect(coinPagePath(mint)).toBe(`/coin/${mint}`)
    expect(isCoinPath('/coin/')).toBe(false)
    expect(isCoinPath('/launch')).toBe(false)
    expect(isCoinPath('/kols')).toBe(false)
    expect(coinMintFromPath('/coin/0x1111111111111111111111111111111111111111')).toBe(
      '0x1111111111111111111111111111111111111111',
    )
  })
})
