export type VerifyInput = {
  platform: 'x' | 'any'
  kolHandle?: string
  urls: string[]
  requiredTicker?: string
  requiredLink?: string
  minPostAgeHours?: number
  minUrls?: number
  deliverableKind?: string
}

export type VerifyResult = {
  ok: boolean
  reason?: string
  details?: Record<string, unknown>
  acceptedUrls?: string[]
}

export interface CampaignVerifier {
  verify(input: VerifyInput): Promise<VerifyResult>
}

// Mock verifier for tests/dev: accept URLs that contain 'x.com' or 'twitter.com' and the required ticker/link text in a naive way.
export class MockXVerifier implements CampaignVerifier {
  async verify(input: VerifyInput): Promise<VerifyResult> {
    const accepted: string[] = []
    const needTicker = (input.requiredTicker || '').toLowerCase().replace(/^\$/, '')
    const needLink = (input.requiredLink || '').toLowerCase()
    for (const u of input.urls) {
      const s = String(u || '').toLowerCase()
      const hostOk = /x\.com|twitter\.com/.test(s)
      const tickerOk = !needTicker || s.includes(needTicker)
      const linkOk = !needLink || s.includes(needLink)
      if (hostOk && tickerOk && linkOk) {
        accepted.push(u)
      }
    }
    if (!accepted.length) {
      return { ok: false, reason: 'No acceptable X post URLs found', details: { input } }
    }
    // Simulate minPostAgeHours by not enforcing in the mock; real impl would re-check after TTL.
    return { ok: true, acceptedUrls: accepted, details: { matched: accepted.length } }
  }
}

/** Accept public HTTPS deliverable URLs (memes, banners, site previews). */
export class CreativeDeliverableVerifier implements CampaignVerifier {
  async verify(input: VerifyInput): Promise<VerifyResult> {
    const accepted: string[] = []
    const needTicker = (input.requiredTicker || '').toLowerCase().replace(/^\$/, '')
    const needLink = (input.requiredLink || '').toLowerCase()
    for (const u of input.urls) {
      let parsed: URL
      try {
        parsed = new URL(String(u || ''))
      } catch {
        continue
      }
      if (parsed.protocol !== 'https:') continue
      const s = String(u || '').toLowerCase()
      const tickerOk = !needTicker || s.includes(needTicker)
      const linkOk = !needLink || s.includes(needLink)
      if (tickerOk && linkOk) accepted.push(u)
    }
    const min = Math.max(1, input.minUrls || 1)
    if (accepted.length < min) {
      return {
        ok: false,
        reason: `Need at least ${min} public https deliverable URL(s)`,
        details: { input, accepted: accepted.length },
      }
    }
    return { ok: true, acceptedUrls: accepted, details: { matched: accepted.length } }
  }
}

export function defaultVerifier(kind?: string): CampaignVerifier {
  if (kind && kind !== 'x-upkeep' && kind !== 'x-post') {
    return new CreativeDeliverableVerifier()
  }
  return new MockXVerifier()
}

