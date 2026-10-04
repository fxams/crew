import { PublicKey } from '@solana/web3.js'
import { MAX_CREW, MODE_DESK_BPS } from './config'
import type { CrewMember, DeskMode, LaunchDraft } from './types'

const HANDLE_RE = /^@[a-z0-9_]{1,15}$/i

export type NormalizedLaunch = {
  name: string
  ticker: string
  vibe: string
  mode: DeskMode
  crew: CrewMember[]
  initialBuySol: number
  /** Final on-chain shareholders in bps (includes desk reserve when mode ≠ split). */
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

export function validateDraft(
  draft: LaunchDraft,
  opts?: { requireWallets?: boolean; deskWallet?: string },
): NormalizedLaunch {
  const requireWallets = opts?.requireWallets ?? false
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
    throw new Error('Vibe max 280 characters.')
  }
  if (draft.initialBuySol < 0 || draft.initialBuySol > 100) {
    throw new Error('Initial buy must be between 0 and 100 SOL.')
  }
  if (draft.crew.length < 1 || draft.crew.length > MAX_CREW) {
    throw new Error(`Tag between 1 and ${MAX_CREW} crew members.`)
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

    let wallet = member.wallet.trim()
    if (requireWallets || wallet) {
      wallet = assertWallet(wallet)
      if (seenWallets.has(wallet)) throw new Error(`Duplicate wallet: ${wallet}`)
      seenWallets.add(wallet)
    }

    crew.push({ handle, wallet, share })
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
    // Empty wallet is allowed for demo launches (share map is local only).
    out.push({
      wallet: row.member.wallet,
      bps: row.bps,
      handle: row.member.handle,
      role: 'crew',
    })
  }

  if (deskBps > 0 && deskWallet) {
    const existing = out.find((s) => s.wallet === deskWallet)
    if (existing) {
      // Launcher is also crew — merge desk reserve into one shareholder row.
      existing.bps += deskBps
      existing.role = 'desk'
    } else {
      out.unshift({
        wallet: deskWallet,
        bps: deskBps,
        handle: '@desk',
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
