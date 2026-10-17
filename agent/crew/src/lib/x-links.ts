import { isMobileUserAgent } from './wallet'

export const X_APP_FALLBACK_MS = 1500

const X_HOST = /^(www\.)?(x|twitter)\.com$/i

const RESERVED_PATHS = new Set([
  'about',
  'account',
  'articles',
  'communities',
  'compose',
  'download',
  'explore',
  'hashtag',
  'help',
  'home',
  'i',
  'intent',
  'jobs',
  'login',
  'messages',
  'notifications',
  'oauth',
  'premium',
  'privacy',
  'search',
  'settings',
  'share',
  'signup',
  'tos',
])

export type XOpenPlan =
  | { kind: 'desktop-tab'; https: string }
  | { kind: 'same-tab'; https: string }
  | { kind: 'app-then-web'; deep: string; https: string; fallbackMs: number }

function parseXUrl(href: string): URL | null {
  if (!/^https?:\/\//i.test(href.trim())) return null
  try {
    const u = new URL(href)
    if (!X_HOST.test(u.hostname)) return null
    return u
  } catch {
    return null
  }
}

export function isXWebUrl(href: string | undefined | null): boolean {
  if (!href) return false
  return parseXUrl(href) != null
}

export function isXAuthUrl(href: string): boolean {
  const u = parseXUrl(href)
  if (!u) return false
  return /\/i\/oauth2\b/i.test(u.pathname) || /\/oauth\b/i.test(u.pathname)
}

export function canonicalXHttpsUrl(href: string): string {
  const u = parseXUrl(href)
  if (!u) return href
  u.protocol = 'https:'
  u.hostname = 'x.com'
  return u.toString()
}

/** twitter:// deep link for a public X URL, or null when none exists (incl. OAuth). */
export function twitterAppDeepLink(href: string): string | null {
  const https = canonicalXHttpsUrl(href)
  const u = parseXUrl(https)
  if (!u || isXAuthUrl(https)) return null

  const status = u.pathname.match(/\/(?:[^/]+\/)?status(?:es)?\/(\d+)/)
  if (status) return `twitter://status?id=${status[1]}`

  if (/^\/intent\/(post|tweet)\/?$/i.test(u.pathname)) {
    const text = u.searchParams.get('text') || ''
    const pageUrl = u.searchParams.get('url') || ''
    const reply = (u.searchParams.get('in_reply_to') || '').trim()
    const parts = [text, pageUrl]
    if (/^\d+$/.test(reply)) parts.push(`https://x.com/i/status/${reply}`)
    const message = parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
    if (!message) return null
    return `twitter://post?message=${encodeURIComponent(message)}`
  }

  if (/^\/intent\/(user|follow)\/?$/i.test(u.pathname)) {
    const name = (u.searchParams.get('screen_name') || '').replace(/^@+/, '')
    if (!name) return null
    return `twitter://user?screen_name=${encodeURIComponent(name)}`
  }

  const profile = u.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/?$/)
  if (profile && !RESERVED_PATHS.has(profile[1].toLowerCase())) {
    return `twitter://user?screen_name=${profile[1]}`
  }

  return null
}

export function planXOpen(href: string, ua: string): XOpenPlan {
  const https = canonicalXHttpsUrl(href)
  if (!isMobileUserAgent(ua)) return { kind: 'desktop-tab', https }
  if (isXAuthUrl(https)) return { kind: 'same-tab', https }
  const deep = twitterAppDeepLink(https)
  if (!deep) return { kind: 'same-tab', https }
  return { kind: 'app-then-web', deep, https, fallbackMs: X_APP_FALLBACK_MS }
}

type OpenXOpts = {
  assign?: (url: string) => void
  openTab?: (url: string, target?: string, features?: string) => Window | null
  nowVisible?: () => boolean
}

let activeFallback: { timer: ReturnType<typeof setTimeout>; onVis: () => void } | null = null

function clearXOpenFallback() {
  if (!activeFallback) return
  clearTimeout(activeFallback.timer)
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', activeFallback.onVis)
  }
  activeFallback = null
}

/** Desktop: new tab. Mobile: twitter:// then same-tab https if the page stays visible. */
export function openXUrl(href: string, opts?: OpenXOpts): void {
  const assign =
    opts?.assign ||
    ((url: string) => {
      window.location.href = url
    })
  const openTab =
    opts?.openTab ||
    ((url: string, target?: string, features?: string) => window.open(url, target, features))
  const visible = opts?.nowVisible || (() => document.visibilityState === 'visible')

  const plan = planXOpen(href, typeof navigator === 'undefined' ? '' : navigator.userAgent)
  if (plan.kind === 'desktop-tab') {
    openTab(plan.https, '_blank', 'noopener,noreferrer')
    return
  }
  if (plan.kind === 'same-tab') {
    assign(plan.https)
    return
  }

  clearXOpenFallback()
  const onVis = () => {
    if (!visible()) clearXOpenFallback()
  }
  const timer = setTimeout(() => {
    if (visible()) assign(plan.https)
    clearXOpenFallback()
  }, plan.fallbackMs)
  activeFallback = { timer, onVis }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVis)
  }
  assign(plan.deep)
}

export function shouldCaptureXLinkClick(event: MouseEvent, href: string): boolean {
  if (event.defaultPrevented || event.button !== 0) return false
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false
  if (typeof navigator === 'undefined' || !isMobileUserAgent(navigator.userAgent)) return false
  if (!isXWebUrl(href) || isXAuthUrl(href)) return false
  return true
}

/** Capture-phase click handler so leftover x.com anchors still open the app on phones. */
export function installMobileXLinkCapture(): () => void {
  const onClick = (event: MouseEvent) => {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : []
    const fromPath = path.find((n): n is HTMLAnchorElement => n instanceof HTMLAnchorElement)
    const el =
      fromPath ||
      (event.target instanceof Element ? event.target.closest('a') : null)
    if (!(el instanceof HTMLAnchorElement)) return
    if (el.hasAttribute('download')) return
    const href = el.href
    if (!shouldCaptureXLinkClick(event, href)) return
    event.preventDefault()
    openXUrl(href)
  }
  document.addEventListener('click', onClick, true)
  return () => document.removeEventListener('click', onClick, true)
}
