import { PUMP_COIN_URL } from '../config'
import { DEFAULT_BUYBACK, DEFAULT_RAID_QUESTS } from '../edges'
import type { LaunchDraft, LaunchResult, RemitRecord } from '../types'
import { validateDraft } from '../validation'

function deskPrograms(draft: LaunchDraft, mode: LaunchDraft['mode']) {
  if (mode === 'buyback') {
    return { buybackRule: draft.buybackRule ?? { ...DEFAULT_BUYBACK }, raidQuests: undefined }
  }
  if (mode === 'raid') {
    return {
      buybackRule: undefined,
      raidQuests: (draft.raidQuests ?? DEFAULT_RAID_QUESTS).map((q) => ({ ...q })),
    }
  }
  return { buybackRule: undefined, raidQuests: undefined }
}

function id(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

function fakeMint(): string {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  let out = ''
  for (let i = 0; i < 40; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)]
  return `${out}pump`
}

function fakeSig(): string {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  let out = ''
  for (let i = 0; i < 64; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)]
  return out
}

/** Demo path — no wallet / chain. Still validates crew split. */
export async function launchDemo(draft: LaunchDraft): Promise<LaunchResult> {
  try {
    const normalized = validateDraft(draft, { requireWallets: false })
    await wait(500)
    const mint = fakeMint()
    const launchedAt = Number(new Date())
    const remits: RemitRecord[] = normalized.crew.slice(0, 3).map((m, i) => ({
      id: id('remit'),
      mint,
      ticker: normalized.ticker,
      handle: m.handle,
      wallet: m.wallet,
      amountSol: Number((0.004 + Math.random() * 0.02).toFixed(4)),
      mode: normalized.mode,
      at: launchedAt + (i + 1) * 800,
      network: 'demo',
    }))
    return {
      ok: true,
      coin: {
        id: id('coin'),
        mint,
        name: normalized.name,
        ticker: normalized.ticker,
        vibe: normalized.vibe,
        mode: normalized.mode,
        crew: normalized.crew,
        network: 'demo',
        signature: fakeSig(),
        launchedAt,
        launcher: 'demo',
        pumpUrl: PUMP_COIN_URL(mint),
        ...deskPrograms(draft, normalized.mode),
      },
      remits,
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Demo launch failed.' }
  }
}

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
