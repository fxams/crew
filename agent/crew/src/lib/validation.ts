import { PublicKey } from '@solana/web3.js'
import { MAX_CREW, MODE_DESK_BPS } from './config'
import type { AgentBrief, CrewMember, DeskMode, HireRole, LaunchDraft } from './types'

const HANDLE_RE = /^@[a-z0-9_]{1,15}$/i
const HIRE_ROLES = new Set<HireRole>(['caller', 'chart', 'raid', 'kol', 'dev', 'agent'])
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'])
const MAX_IMAGE_BYTES = 15 * 1024 * 1024

export type NormalizedLaunch = {
  name: string
  ticker: string
  vibe: string
  mode: DeskMode
  crew: CrewMember[]
  initialBuySol: number
  twitter?: string
  website?: string
  agent?: AgentBrief
  /** Final on-chain shareholders in bps (includes desk/agent reserve when mode ≠ split). */
  shareholders: { wallet: string; bps: number; handle: string; role: 'crew' | 'desk' }[]
}

export function normalizeHandle(raw: string): string {
  const h = raw.trim().replace(/^@+/, '').toLowerCase()
  if (!/^[a-z0-9_]{1,15}$/.test(h)) {
    throw new Error(`Invalid X handle: ${raw || '(empty)'}`)
  }
  return `@${h}`
}

export function assertWallet(raw: string): string {
  const value = raw.trim()
  try {
    const key = new PublicKey(value)
    if (PublicKey.isOnCurve(key.toBytes()) === false && key.toBase58().length < 32) {
      // still accept valid pubkeys (PDAs etc. are on-curve check optional)
    }
    return key.toBase58()
  } catch {
    throw new Error(`Invalid Solana wallet: ${raw || '(empty)'}`)
  }
}

export function assertImageFile(file: File | null | undefined): File {
  if (!file) throw new Error('Coin image is required.')
  const type = (file.type || '').toLowerCase()
  if (type && !IMAGE_TYPES.has(type)) {
    throw new Error('Image must be PNG, JPG, GIF, or WebP.')
  }
  if (file.size <= 0) throw new Error('Coin image is empty.')
  if (file.size > MAX_IMAGE_BYTES) throw new Error('Coin image must be 15MB or smaller.')
  return file
}

/** Optional X link — empty allowed; @handle or x.com / twitter.com URL. */
export function normalizeOptionalTwitter(raw: string | undefined): string | undefined {
  const value = (raw || '').trim()
  if (!value) return undefined
  if (/^https?:\/\/(www\.)?(x\.com|twitter\.com)\/[A-Za-z0-9_]+/i.test(value)) {
    return value.split('?')[0].replace(/\/$/, '')
  }
  if (/^@?[a-z0-9_]{1,15}$/i.test(value)) {
    return `https://x.com/${value.replace(/^@/, '')}`
  }
  throw new Error('X must be @handle or https://x.com/…')
}

/** Optional website — empty allowed; http(s) URL. */
export function normalizeOptionalWebsite(raw: string | undefined): string | undefined {
  const value = (raw || '').trim()
  if (!value) return undefined
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('bad protocol')
    }
    if (!url.hostname.includes('.')) throw new Error('bad host')
    return url.toString().replace(/\/$/, '')
  } catch {
    throw new Error('Website must be a valid URL.')
  }
}

/**
 * Soft readiness check for enabling Launch CTAs.
 * Does not require a connected wallet (Connect & launch still opens the modal).
 */
export function getLaunchBlockers(draft: LaunchDraft): string[] {
  const blockers: string[] = []
  const name = draft.name.trim()
  const ticker = draft.ticker.trim().toUpperCase().replace(/^\$/, '')
  const vibe = draft.vibe.trim()

  if (name.length < 2 || name.length > 32) blockers.push('Name (2–32 chars)')
  if (!/^[A-Z0-9]{2,13}$/.test(ticker)) blockers.push('Ticker (2–13 letters/numbers)')
  if (vibe.length > 280) blockers.push('Description too long')
  try {
    assertImageFile(draft.imageFile)
  } catch {
    blockers.push('Coin image')
  }
  if (draft.initialBuySol < 0 || draft.initialBuySol > 100) {
    blockers.push('Initial buy (0–100 SOL)')
  }
  if (draft.crew.length < 1 || draft.crew.length > MAX_CREW) {
    blockers.push(`Crew (1–${MAX_CREW})`)
  }

  try {
    normalizeOptionalTwitter(draft.twitter)
  } catch {
    blockers.push('X link')
  }
  try {
    normalizeOptionalWebsite(draft.website)
  } catch {
    blockers.push('Website')
  }

  if (draft.mode === 'agent') {
    const agentName = (draft.agent?.name || '').trim()
    const objective = (draft.agent?.objective || '').trim()
    if (agentName.length < 2) blockers.push('Agent name')
    if (objective.length < 8) blockers.push('Agent objective')
  }

  let shareSum = 0
  const seenHandles = new Set<string>()
  const seenWallets = new Set<string>()
  for (const member of draft.crew) {
    try {
      const handle = normalizeHandle(member.handle)
      if (seenHandles.has(handle)) blockers.push(`Duplicate ${handle}`)
      seenHandles.add(handle)
    } catch {
      blockers.push('Crew handle')
    }
    const share = Math.round(Number(member.share) || 0)
    if (share <= 0 || share > 100) blockers.push('Crew share')
    shareSum += share
    try {
      const wallet = assertWallet(member.wallet)
      if (seenWallets.has(wallet)) blockers.push('Duplicate wallet')
      seenWallets.add(wallet)
    } catch {
      blockers.push('Crew wallet')
    }
    if (draft.mode === 'agent' && !(member.hireRole && HIRE_ROLES.has(member.hireRole))) {
      blockers.push('Hire role')
    }
  }
  if (draft.crew.length && shareSum !== 100) {
    blockers.push(`Shares must total 100% (now ${shareSum}%)`)
  }

  // Dedupe while preserving order
  return [...new Set(blockers)]
}

export function isLaunchReady(draft: LaunchDraft): boolean {
  return getLaunchBlockers(draft).length === 0
}

export function validateDraft(
  draft: LaunchDraft,
  opts?: { deskWallet?: string },
): NormalizedLaunch {
  const name = draft.name.trim()
  const ticker = draft.ticker.trim().toUpperCase().replace(/^\$/, '')
  const vibe = draft.vibe.trim()

  if (name.length < 2 || name.length > 32) {
    throw new Error('Name must be 2–32 characters.')
  }
  if (!/^[A-Z0-9]{2,13}$/.test(ticker)) {
    throw new Error('Ticker must be 2–13 letters/numbers.')
  }
  if (vibe.length > 280) {
    throw new Error('Description max 280 characters.')
  }
  assertImageFile(draft.imageFile)
  const twitter = normalizeOptionalTwitter(draft.twitter)
  const website = normalizeOptionalWebsite(draft.website)
  if (draft.initialBuySol < 0 || draft.initialBuySol > 100) {
    throw new Error('Initial buy must be between 0 and 100 SOL.')
  }
  if (draft.crew.length < 1 || draft.crew.length > MAX_CREW) {
    throw new Error(`Tag between 1 and ${MAX_CREW} crew members.`)
  }

  let agent: AgentBrief | undefined
  if (draft.mode === 'agent') {
    const agentName = (draft.agent?.name || '').trim().slice(0, 48)
    const objective = (draft.agent?.objective || '').trim().slice(0, 280)
    const model = (draft.agent?.model || 'custom').trim().slice(0, 48)
    if (agentName.length < 2) throw new Error('Agent needs a name (2+ chars).')
    if (objective.length < 8) throw new Error('Agent objective must be at least 8 characters.')
    agent = { name: agentName, objective, model: model || 'custom' }
  }

  const seenHandles = new Set<string>()
  const seenWallets = new Set<string>()
  let shareSum = 0
  const crew: CrewMember[] = []

  for (const member of draft.crew) {
    const handle = normalizeHandle(member.handle)
    if (seenHandles.has(handle)) throw new Error(`Duplicate handle: ${handle}`)
    seenHandles.add(handle)

    const share = Math.round(Number(member.share) || 0)
    if (share <= 0 || share > 100) throw new Error(`Bad split for ${handle}.`)
    shareSum += share

    const wallet = assertWallet(member.wallet)
    if (seenWallets.has(wallet)) throw new Error(`Duplicate wallet: ${wallet}`)
    seenWallets.add(wallet)

    const hireRole = member.hireRole && HIRE_ROLES.has(member.hireRole) ? member.hireRole : undefined
    if (draft.mode === 'agent' && !hireRole) {
      throw new Error(`Assign a hire role for ${handle}.`)
    }

    crew.push({ handle, wallet, share, hireRole })
  }

  if (shareSum !== 100) {
    throw new Error(`Crew shares must total 100% (currently ${shareSum}%).`)
  }

  return {
    name,
    ticker,
    vibe,
    mode: draft.mode,
    crew,
    initialBuySol: draft.initialBuySol,
    twitter,
    website,
    agent,
    shareholders: buildShareholders(crew, draft.mode, opts?.deskWallet),
  }
}

function buildShareholders(
  crew: CrewMember[],
  mode: DeskMode,
  deskWallet?: string,
): NormalizedLaunch['shareholders'] {
  const deskBps = MODE_DESK_BPS[mode]
  const crewPoolBps = 10_000 - deskBps
  const out: NormalizedLaunch['shareholders'] = []

  if (deskBps > 0 && !deskWallet) {
    throw new Error('Connect a wallet — desk reserve needs the launcher address.')
  }

  // Allocate crewPoolBps proportionally; fix rounding on the largest share.
  const raw = crew.map((m) => ({
    member: m,
    bps: Math.floor((crewPoolBps * m.share) / 100),
  }))
  const allocated = raw.reduce((s, r) => s + r.bps, 0)
  if (raw.length && allocated !== crewPoolBps) {
    raw.sort((a, b) => b.bps - a.bps)[0].bps += crewPoolBps - allocated
  }

  for (const row of raw) {
    if (row.bps <= 0) continue
    if (!row.member.wallet) {
      throw new Error(`Wallet required for ${row.member.handle}.`)
    }
    out.push({
      wallet: row.member.wallet,
      bps: row.bps,
      handle: row.member.handle,
      role: 'crew',
    })
  }

  if (deskBps > 0 && deskWallet) {
    const deskHandle =
      mode === 'agent' ? '@agent' : mode === 'raid' ? '@raid' : mode === 'buyback' ? '@buyback' : '@desk'
    const existing = out.find((s) => s.wallet === deskWallet)
    if (existing) {
      // Launcher is also crew — merge desk reserve into one shareholder row.
      existing.bps += deskBps
      existing.role = 'desk'
      if (mode === 'agent') existing.handle = '@agent'
    } else {
      out.unshift({
        wallet: deskWallet,
        bps: deskBps,
        handle: deskHandle,
        role: 'desk',
      })
    }
  }

  const total = out.reduce((s, r) => s + r.bps, 0)
  if (total !== 10_000) {
    throw new Error(`Internal share map must total 10000 bps (got ${total}).`)
  }
  return out
}

export function isHandle(value: string): boolean {
  return HANDLE_RE.test(value.startsWith('@') ? value : `@${value}`)
}
