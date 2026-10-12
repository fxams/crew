import { describe, expect, it } from 'vitest'
import {
  offeringRegistry,
  parseOfferingId,
  validateRequirement,
} from './offerings.js'

describe('ACP offerings', () => {
  it('exports registry JSON for both offerings', () => {
    const list = offeringRegistry({ autohireUsd: 0.02, launchUsd: 0.1 })
    expect(list.map((o) => o.name)).toEqual([
      'crewpay_autohire_kol_crew',
      'crewpay_launch_with_crew',
    ])
    const auto = list[0]
    expect(auto.requirements.required).toEqual(['mint', 'platform', 'budget'])
    expect(auto.priceUsd).toBe(0.02)
    expect(list[1].description).toMatch(/non-custodial|never holds/i)
    expect(list[1].description).toMatch(/crew_submit_signed/)
  })

  it('validates autohire requirement schema', () => {
    const ok = validateRequirement('crewpay_autohire_kol_crew', {
      mint: 'So11111111111111111111111111111111111111112',
      platform: 'pumpfun',
      budget: 5,
    })
    expect(ok.ok).toBe(true)
    const bad = validateRequirement('crewpay_autohire_kol_crew', { platform: 'pumpfun' })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.error).toMatch(/mint/i)
  })

  it('validates launch requirement and requires an image', () => {
    const ok = validateRequirement('crewpay_launch_with_crew', {
      name: 'Night Owl',
      ticker: 'HOOT',
      platform: 'pumpfun',
      launcherPubkey: 'So11111111111111111111111111111111111111112',
      imageUrl: 'https://example.com/hoot.png',
      autoHire: true,
    })
    expect(ok.ok).toBe(true)
    const missingImage = validateRequirement('crewpay_launch_with_crew', {
      name: 'Night Owl',
      ticker: 'HOOT',
      launcherPubkey: 'So11111111111111111111111111111111111111112',
    })
    expect(missingImage.ok).toBe(false)
    expect(parseOfferingId('crewpay_launch_with_crew')).toBe('crewpay_launch_with_crew')
    expect(parseOfferingId('meme')).toBeNull()
  })
})
