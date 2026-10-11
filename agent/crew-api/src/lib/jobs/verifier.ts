export type VerifyInput = {
  platform: 'x'
  kolHandle?: string
  urls: string[]
  requiredTicker?: string
  requiredLink?: string
  minPostAgeHours?: number
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

export function defaultVerifier(): CampaignVerifier {
  return new MockXVerifier()
}

