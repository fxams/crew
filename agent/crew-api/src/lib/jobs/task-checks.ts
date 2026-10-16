import type { TaskAutoChecks } from './types.js'
import { defaultVerifier } from './verifier.js'

export type TaskProofInput = {
  urls: string[]
  text?: string
  files?: { name: string; url?: string; mime?: string; size?: number }[]
  kolHandle?: string
  submittedAtMs?: number
}

export type UrlReachabilityChecker = (url: string) => Promise<boolean>

const defaultReachability: UrlReachabilityChecker = async (url) => {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 4_000)
    try {
      const res = await fetch(url, { method: 'HEAD', signal: ctrl.signal, redirect: 'follow' })
      if (res.ok || res.status === 405) return true
      const getRes = await fetch(url, { method: 'GET', signal: ctrl.signal, redirect: 'follow' })
      return getRes.ok
    } finally {
      clearTimeout(t)
    }
  } catch {
    return false
  }
}

export async function runTaskAutoChecks(
  checks: TaskAutoChecks | undefined,
  proof: TaskProofInput,
  opts?: { reachability?: UrlReachabilityChecker },
): Promise<{ ok: boolean; reason?: string; details?: Record<string, unknown>; acceptedUrls?: string[] }> {
  const cfg = checks || {}
  const urls = (proof.urls || []).map((u) => String(u || '').trim()).filter(Boolean)
  const text = (proof.text || '').trim()
  const files = proof.files || []
  const combined = `${text}\n${urls.join('\n')}\n${files.map((f) => f.name).join('\n')}`.toLowerCase()

  if (cfg.minTextLength && text.length < cfg.minTextLength) {
    return { ok: false, reason: `Proof text shorter than minTextLength (${cfg.minTextLength})` }
  }

  if (cfg.keyword) {
    const kw = cfg.keyword.toLowerCase()
    if (!combined.includes(kw)) {
      return { ok: false, reason: `Missing required keyword: ${cfg.keyword}` }
    }
  }

  if (cfg.regex) {
    try {
      const re = new RegExp(cfg.regex, 'i')
      if (!re.test(combined)) {
        return { ok: false, reason: 'Proof did not match required regex' }
      }
    } catch {
      return { ok: false, reason: 'Invalid task regex configuration' }
    }
  }

  const minUrls = Math.max(0, cfg.minUrls ?? 0)
  if (minUrls > 0 && urls.length < minUrls) {
    return { ok: false, reason: `Need at least ${minUrls} URL(s) in proof` }
  }

  if (cfg.requireHttpsUrls) {
    for (const u of urls) {
      try {
        if (new URL(u).protocol !== 'https:') {
          return { ok: false, reason: 'All proof URLs must be https' }
        }
      } catch {
        return { ok: false, reason: 'Invalid proof URL' }
      }
    }
  }

  const minFiles = cfg.minFiles ?? 0
  const maxFiles = cfg.maxFiles ?? 64
  if (files.length < minFiles) {
    return { ok: false, reason: `Need at least ${minFiles} file reference(s)` }
  }
  if (files.length > maxFiles) {
    return { ok: false, reason: `Too many file references (max ${maxFiles})` }
  }

  const extAllow = (cfg.fileExtensions || []).map((e) => e.toLowerCase().replace(/^\./, ''))
  if (extAllow.length && files.length) {
    for (const f of files) {
      const name = f.name.toLowerCase()
      const ext = name.includes('.') ? name.split('.').pop() || '' : ''
      if (!extAllow.includes(ext)) {
        return { ok: false, reason: `File extension not allowed: ${f.name}` }
      }
    }
  }

  if (cfg.urlReachable && urls.length) {
    const reach = opts?.reachability ?? defaultReachability
    const reachable: string[] = []
    for (const u of urls) {
      if (await reach(u)) reachable.push(u)
    }
    if (!reachable.length) {
      return { ok: false, reason: 'No reachable URLs in proof', details: { urls } }
    }
  }

  if (cfg.minEngagement != null && cfg.minEngagement > 0) {
    const m = /engagement[:\s=]+(\d+)/i.exec(text)
    const engagement = m ? Number(m[1]) : 0
    if (!Number.isFinite(engagement) || engagement < cfg.minEngagement) {
      return {
        ok: false,
        reason: `Engagement below minimum (${cfg.minEngagement})`,
        details: { engagement, minEngagement: cfg.minEngagement },
      }
    }
  }

  if (cfg.postedWithinHours != null && cfg.launchAtMs) {
    const submittedAt = Number(proof.submittedAtMs) || Date.now()
    const windowMs = cfg.postedWithinHours * 60 * 60_000
    if (submittedAt > cfg.launchAtMs + windowMs) {
      return {
        ok: false,
        reason: `Post submitted outside promo window (${cfg.postedWithinHours}h)`,
        details: { submittedAt, launchAtMs: cfg.launchAtMs },
      }
    }
  }

  if (cfg.xPost) {
    const vi = await defaultVerifier('x-post').verify({
      platform: 'x',
      kolHandle: proof.kolHandle,
      urls,
      requiredTicker: cfg.requiredTicker,
      requiredLink: cfg.requiredLink,
      minUrls: cfg.minUrls,
    })
    if (!vi.ok) return vi
    if (cfg.stillLiveAfterHours != null && cfg.stillLiveAfterHours > 0 && urls.length) {
      const reach = opts?.reachability ?? defaultReachability
      const live: string[] = []
      for (const u of urls) {
        if (await reach(u)) live.push(u)
      }
      if (!live.length) {
        return {
          ok: false,
          reason: `Post not reachable (still-live check after ${cfg.stillLiveAfterHours}h)`,
          details: { stillLiveAfterHours: cfg.stillLiveAfterHours },
        }
      }
    }
    return { ok: true, acceptedUrls: vi.acceptedUrls, details: { ...(vi.details || {}), xPost: true } }
  }

  return {
    ok: true,
    acceptedUrls: urls.length ? urls : undefined,
    details: { files: files.length, textLen: text.length },
  }
}
