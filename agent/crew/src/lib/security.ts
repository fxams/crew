import type {
  BuybackRule,
  CoinRecord,
  CrewMember,
  DeskMode,
  LaunchDraft,
  RaidQuest,
  RemitRecord,
} from './types'

const ALLOWED_RPC_HOSTS = new Set([
  'api.mainnet-beta.solana.com',
  'api.devnet.solana.com',
  'solana-mainnet.g.alchemy.com',
  'mainnet.helius-rpc.com',
  'rpc.ankr.com',
  'solana-api.projectserum.com',
])

/** Only https RPC endpoints; prefer known hosts, allow other https with warning path. */
export function assertSafeRpcUrl(raw: string): string {
  const value = raw.trim()
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('Invalid RPC URL.')
  }
  if (url.protocol !== 'https:') {
    throw new Error('RPC URL must use HTTPS.')
  }
  if (url.username || url.password) {
    throw new Error('RPC URL must not embed credentials.')
  }
  // Block obvious SSRF to localhost / link-local
  const host = url.hostname.toLowerCase()
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.local') ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    host.startsWith('169.254.')
  ) {
    throw new Error('RPC URL host is not allowed.')
  }
  void ALLOWED_RPC_HOSTS
  return url.toString().replace(/\/$/, '')
}

const MODES = new Set<DeskMode>(['split', 'buyback', 'raid', 'agent'])
const HIRE_ROLES = new Set(['caller', 'chart', 'raid', 'kol', 'dev', 'agent'])

function asString(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  let out = ''
  for (let i = 0; i < value.length && out.length < max; i += 1) {
    const code = value.charCodeAt(i)
    const ch = value[i]
    // Drop control chars + angle brackets (XSS / paste noise)
    if (code < 32 || code === 127 || ch === '<' || ch === '>') continue
    out += ch
  }
  return out
}

function sanitizeCrew(raw: unknown): CrewMember[] {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, 5).map((row) => {
    const r = row && typeof row === 'object' ? (row as Record<string, unknown>) : {}
    const hireRole = asString(r.hireRole, 16)
    return {
      handle: asString(r.handle, 32),
      wallet: asString(r.wallet, 64),
      share: Math.max(0, Math.min(100, Number(r.share) || 0)),
      hireRole: HIRE_ROLES.has(hireRole) ? (hireRole as CrewMember['hireRole']) : undefined,
    }
  })
}

function sanitizeBuyback(raw: unknown): BuybackRule | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  return {
    dipPct: Math.max(1, Math.min(90, Number(r.dipPct) || 18)),
    maxSolPerFire: Math.max(0.01, Math.min(50, Number(r.maxSolPerFire) || 0.25)),
    cooldownHours: Math.max(1, Math.min(168, Number(r.cooldownHours) || 4)),
  }
}

function sanitizeQuests(raw: unknown): RaidQuest[] | undefined {
  if (!Array.isArray(raw)) return undefined
  return raw.slice(0, 5).map((q, i) => {
    const row = q && typeof q === 'object' ? (q as Record<string, unknown>) : {}
    return {
      id: asString(row.id, 40) || `q_${i}`,
      title: asString(row.title, 120),
      bountyBps: Math.max(0, Math.min(10_000, Number(row.bountyBps) || 0)),
      proof: asString(row.proof, 80),
    }
  })
}

function sanitizeAgent(raw: unknown) {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const name = asString(r.name, 48)
  const objective = asString(r.objective, 280)
  const model = asString(r.model, 48)
  if (!name && !objective) return undefined
  return { name: name || 'Crew Agent', objective, model: model || 'custom' }
}

export function sanitizeCoin(raw: unknown): CoinRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  if ('__proto__' in r || 'prototype' in r || 'constructor' in r) {
    // drop prototype-pollution vectors
  }
  const mode = asString(r.mode, 16) as DeskMode
  if (!MODES.has(mode)) return null
  const mint = asString(r.mint, 64)
  const ticker = asString(r.ticker, 16)
  if (!mint || !ticker) return null
  return {
    id: asString(r.id, 40) || mint.slice(0, 12),
    mint,
    name: asString(r.name, 64),
    ticker,
    vibe: asString(r.vibe, 280),
    mode,
    crew: sanitizeCrew(r.crew),
    signature: asString(r.signature, 128),
    feeShareSignature: asString(r.feeShareSignature, 128) || undefined,
    launchedAt: Math.max(0, Number(r.launchedAt) || 0),
    launcher: asString(r.launcher, 64),
    pumpUrl: asString(r.pumpUrl, 200).startsWith('https://')
      ? asString(r.pumpUrl, 200)
      : `https://pump.fun/coin/${mint}`,
    buybackRule: sanitizeBuyback(r.buybackRule),
    raidQuests: sanitizeQuests(r.raidQuests),
    agent: sanitizeAgent(r.agent),
  }
}

export function sanitizeRemit(raw: unknown): RemitRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const mint = asString(r.mint, 64)
  const handle = asString(r.handle, 32)
  const mode = asString(r.mode, 16) as DeskMode
  if (!mint || !handle || !MODES.has(mode)) return null
  return {
    id: asString(r.id, 40) || `r_${mint.slice(0, 8)}`,
    mint,
    ticker: asString(r.ticker, 16),
    handle,
    wallet: asString(r.wallet, 64),
    amountSol: Math.max(0, Math.min(1_000_000, Number(r.amountSol) || 0)),
    mode,
    at: Math.max(0, Number(r.at) || 0),
    signature: asString(r.signature, 128) || undefined,
  }
}

export function sanitizeBoard(raw: unknown): { coins: CoinRecord[]; remits: RemitRecord[] } {
  if (!raw || typeof raw !== 'object') return { coins: [], remits: [] }
  const board = raw as Record<string, unknown>
  const coins = Array.isArray(board.coins)
    ? board.coins.map(sanitizeCoin).filter((c): c is CoinRecord => Boolean(c)).slice(0, 100)
    : []
  const remits = Array.isArray(board.remits)
    ? board.remits.map(sanitizeRemit).filter((r): r is RemitRecord => Boolean(r)).slice(0, 200)
    : []
  return { coins, remits }
}

/** Persistable launch draft (no File / image). */
export function sanitizeDraft(raw: unknown): LaunchDraft {
  const fallback: LaunchDraft = {
    name: '',
    ticker: '',
    vibe: '',
    mode: 'split',
    crew: [{ handle: '@', wallet: '', share: 100 }],
    initialBuySol: 0.1,
    imageFile: null,
    buybackRule: undefined,
    raidQuests: undefined,
    agent: undefined,
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fallback
  const r = raw as Record<string, unknown>
  const mode = asString(r.mode, 16) as DeskMode
  const safeMode = MODES.has(mode) ? mode : 'split'
  const crew = sanitizeCrew(r.crew)
  return {
    name: asString(r.name, 64),
    ticker: asString(r.ticker, 16).toUpperCase(),
    vibe: asString(r.vibe, 280),
    mode: safeMode,
    crew: crew.length ? crew : fallback.crew,
    initialBuySol: Math.max(0, Math.min(100, Number(r.initialBuySol) || 0.1)),
    imageFile: null,
    buybackRule: safeMode === 'buyback' ? sanitizeBuyback(r.buybackRule) : undefined,
    raidQuests: safeMode === 'raid' ? sanitizeQuests(r.raidQuests) : undefined,
    agent: safeMode === 'agent' ? sanitizeAgent(r.agent) : undefined,
  }
}

export function sanitizeUiPrefs(raw: unknown): { selectedMint?: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const mint = asString((raw as Record<string, unknown>).selectedMint, 64)
  return mint ? { selectedMint: mint } : {}
}
