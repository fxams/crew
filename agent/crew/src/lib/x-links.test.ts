import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  X_APP_FALLBACK_MS,
  canonicalXHttpsUrl,
  isXAuthUrl,
  isXWebUrl,
  openXUrl,
  planXOpen,
  twitterAppDeepLink,
} from './x-links'

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36'
const DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'

describe('isXWebUrl / canonical', () => {
  it('accepts x.com and twitter.com', () => {
    expect(isXWebUrl('https://x.com/CrewPayHQ')).toBe(true)
    expect(isXWebUrl('https://twitter.com/CrewPayHQ/status/1')).toBe(true)
    expect(isXWebUrl('https://www.x.com/intent/post?text=hi')).toBe(true)
    expect(isXWebUrl('https://pump.fun/foo')).toBe(false)
    expect(isXWebUrl('/kol')).toBe(false)
  })

  it('normalizes twitter.com to https://x.com', () => {
    expect(canonicalXHttpsUrl('http://twitter.com/CrewPayHQ')).toBe('https://x.com/CrewPayHQ')
  })
})

describe('twitterAppDeepLink', () => {
  it('maps profiles to twitter://user', () => {
    expect(twitterAppDeepLink('https://x.com/CrewPayHQ')).toBe(
      'twitter://user?screen_name=CrewPayHQ',
    )
    expect(twitterAppDeepLink('https://twitter.com/vitalikbuterin/')).toBe(
      'twitter://user?screen_name=vitalikbuterin',
    )
  })

  it('maps status URLs to twitter://status', () => {
    expect(twitterAppDeepLink('https://x.com/CrewPayHQ/status/1234567890?s=20')).toBe(
      'twitter://status?id=1234567890',
    )
    expect(twitterAppDeepLink('https://x.com/i/status/99')).toBe('twitter://status?id=99')
  })

  it('maps compose intents to twitter://post and folds in_reply_to into the text', () => {
    const url = twitterAppDeepLink(
      'https://x.com/intent/post?text=Hello%20world&in_reply_to=555',
    )
    expect(url?.startsWith('twitter://post?message=')).toBe(true)
    const message = decodeURIComponent(url!.replace('twitter://post?message=', ''))
    expect(message).toContain('Hello world')
    expect(message).toContain('https://x.com/i/status/555')
  })

  it('maps intent/tweet text+url into one message', () => {
    const url = twitterAppDeepLink(
      'https://x.com/intent/tweet?text=hi&url=https://crewpay.dev/kol/a',
    )
    const message = decodeURIComponent(url!.replace('twitter://post?message=', ''))
    expect(message).toContain('hi')
    expect(message).toContain('https://crewpay.dev/kol/a')
  })

  it('maps follow/user intents', () => {
    expect(twitterAppDeepLink('https://x.com/intent/user?screen_name=CrewPayHQ')).toBe(
      'twitter://user?screen_name=CrewPayHQ',
    )
  })

  it('does not deep-link OAuth or reserved paths', () => {
    expect(isXAuthUrl('https://x.com/i/oauth2/authorize?e2e=1')).toBe(true)
    expect(twitterAppDeepLink('https://x.com/i/oauth2/authorize?e2e=1')).toBeNull()
    expect(twitterAppDeepLink('https://x.com/home')).toBeNull()
    expect(twitterAppDeepLink('https://x.com/explore')).toBeNull()
  })
})

describe('planXOpen', () => {
  it('keeps desktop as a new tab to https', () => {
    expect(planXOpen('https://x.com/CrewPayHQ', DESKTOP)).toEqual({
      kind: 'desktop-tab',
      https: 'https://x.com/CrewPayHQ',
    })
  })

  it('uses app-then-web on iPhone and Android', () => {
    const ios = planXOpen('https://x.com/CrewPayHQ', IPHONE)
    expect(ios).toEqual({
      kind: 'app-then-web',
      deep: 'twitter://user?screen_name=CrewPayHQ',
      https: 'https://x.com/CrewPayHQ',
      fallbackMs: X_APP_FALLBACK_MS,
    })
    const and = planXOpen('https://x.com/intent/post?text=yo', ANDROID)
    expect(and.kind).toBe('app-then-web')
    if (and.kind === 'app-then-web') {
      expect(and.deep.startsWith('twitter://post?message=')).toBe(true)
      expect(and.https).toContain('x.com/intent/post')
    }
  })

  it('keeps OAuth as same-tab https on mobile', () => {
    expect(planXOpen('https://x.com/i/oauth2/authorize?e2e=1', IPHONE)).toEqual({
      kind: 'same-tab',
      https: 'https://x.com/i/oauth2/authorize?e2e=1',
    })
  })
})

describe('openXUrl', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('opens a desktop tab and never assigns twitter://', () => {
    vi.stubGlobal('navigator', { userAgent: DESKTOP })
    const assign = vi.fn()
    const openTab = vi.fn()
    openXUrl('https://x.com/CrewPayHQ', { assign, openTab })
    expect(openTab).toHaveBeenCalledWith('https://x.com/CrewPayHQ', '_blank', 'noopener,noreferrer')
    expect(assign).not.toHaveBeenCalled()
  })

  it('tries twitter:// first on iPhone, then https if still visible', () => {
    vi.useFakeTimers()
    vi.stubGlobal('navigator', { userAgent: IPHONE })
    const assign = vi.fn()
    let visible = true
    openXUrl('https://x.com/CrewPayHQ', {
      assign,
      openTab: vi.fn(),
      nowVisible: () => visible,
    })
    expect(assign).toHaveBeenCalledTimes(1)
    expect(assign).toHaveBeenCalledWith('twitter://user?screen_name=CrewPayHQ')
    vi.advanceTimersByTime(X_APP_FALLBACK_MS)
    expect(assign).toHaveBeenCalledTimes(2)
    expect(assign).toHaveBeenLastCalledWith('https://x.com/CrewPayHQ')
    visible = false
  })

  it('skips the https fallback when the page is no longer visible', () => {
    vi.useFakeTimers()
    vi.stubGlobal('navigator', { userAgent: IPHONE })
    const assign = vi.fn()
    let visible = true
    openXUrl('https://x.com/CrewPayHQ', {
      assign,
      openTab: vi.fn(),
      nowVisible: () => visible,
    })
    visible = false
    vi.advanceTimersByTime(X_APP_FALLBACK_MS + 50)
    expect(assign).toHaveBeenCalledTimes(1)
    expect(assign).toHaveBeenCalledWith('twitter://user?screen_name=CrewPayHQ')
  })
})

describe('shouldCaptureXLinkClick', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('captures unmodified primary clicks on X URLs only on mobile', async () => {
    const { shouldCaptureXLinkClick } = await import('./x-links')
    const click = (extra: Partial<MouseEvent> = {}) =>
      ({
        defaultPrevented: false,
        button: 0,
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        ...extra,
      }) as MouseEvent

    vi.stubGlobal('navigator', { userAgent: IPHONE })
    expect(shouldCaptureXLinkClick(click(), 'https://x.com/CrewPayHQ')).toBe(true)
    expect(shouldCaptureXLinkClick(click({ metaKey: true }), 'https://x.com/CrewPayHQ')).toBe(false)
    expect(shouldCaptureXLinkClick(click(), 'https://x.com/i/oauth2/authorize')).toBe(false)
    expect(shouldCaptureXLinkClick(click(), 'https://t.me/CrewPayHQ')).toBe(false)

    vi.stubGlobal('navigator', { userAgent: DESKTOP })
    expect(shouldCaptureXLinkClick(click(), 'https://x.com/CrewPayHQ')).toBe(false)
  })
})
