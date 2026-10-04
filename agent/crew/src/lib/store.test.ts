import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DRAFT_KEY,
  STORE_KEY,
  STORE_LEGACY_KEYS,
  UI_KEY,
} from './config'
import {
  clearAllPersistence,
  clearDraft,
  loadBoard,
  loadDraft,
  loadUiPrefs,
  persistLaunch,
  persistRemit,
  resetBoard,
  saveBoard,
  saveDraft,
  saveUiPrefs,
} from './store'
import type { CoinRecord, LaunchDraft, RemitRecord } from './types'

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, String(value))
    },
    removeItem: (key: string) => {
      map.delete(key)
    },
    clear: () => map.clear(),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size
    },
    _map: map,
  }
}

const coin: CoinRecord = {
  id: 'c1',
  mint: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  name: 'Persist Coin',
  ticker: 'PERS',
  vibe: 'round trip',
  mode: 'agent',
  crew: [
    {
      handle: '@caller',
      wallet: '11111111111111111111111111111112',
      share: 100,
      hireRole: 'caller',
    },
  ],
  signature: 'sig_launch',
  feeShareSignature: 'sig_fee',
  launchedAt: 1_700_000_000_000,
  launcher: '11111111111111111111111111111111',
  pumpUrl: 'https://pump.fun/coin/TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  agent: {
    name: 'Desk Mind',
    objective: 'Hire KOLs',
    model: 'Claude Sonnet',
  },
}

const remit: RemitRecord = {
  id: 'r1',
  mint: coin.mint,
  ticker: 'PERS',
  handle: '@agent',
  wallet: '11111111111111111111111111111112',
  amountSol: 0.42,
  mode: 'agent',
  at: 1_700_000_000_100,
  signature: 'sig_remit',
}

const draft: LaunchDraft = {
  name: 'Draft Coin',
  ticker: 'DRFT',
  vibe: 'save me',
  mode: 'buyback',
  crew: [
    {
      handle: '@chart',
      wallet: '11111111111111111111111111111112',
      share: 60,
      hireRole: 'chart',
    },
    {
      handle: '@raid',
      wallet: '11111111111111111111111111111113',
      share: 40,
      hireRole: 'raid',
    },
  ],
  initialBuySol: 0.25,
  imageFile: null,
  buybackRule: { dipPct: 22, maxSolPerFire: 0.5, cooldownHours: 6 },
}

describe('persistence end-to-end', () => {
  beforeEach(() => {
    const storage = memoryStorage()
    vi.stubGlobal('localStorage', storage)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('round-trips board coins + remits including agent hireRole', () => {
    saveBoard({ coins: [coin], remits: [remit] })
    const loaded = loadBoard()
    expect(loaded.coins).toHaveLength(1)
    expect(loaded.coins[0].mode).toBe('agent')
    expect(loaded.coins[0].crew[0].hireRole).toBe('caller')
    expect(loaded.coins[0].agent?.name).toBe('Desk Mind')
    expect(loaded.remits[0].mode).toBe('agent')
    expect(loaded.remits[0].amountSol).toBe(0.42)
    expect(localStorage.getItem(STORE_KEY)).toBeTruthy()
  })

  it('persistLaunch and persistRemit append under caps', () => {
    const afterLaunch = persistLaunch(coin, [remit])
    expect(afterLaunch.coins[0].ticker).toBe('PERS')
    expect(afterLaunch.remits[0].id).toBe('r1')

    const crank: RemitRecord = {
      ...remit,
      id: 'crank_1',
      amountSol: 0,
      mode: 'agent',
      handle: '@agent',
      at: Date.now(),
    }
    const afterCrank = persistRemit(crank)
    expect(afterCrank.remits[0].id).toBe('crank_1')
    expect(afterCrank.remits[1].id).toBe('r1')
    expect(loadBoard().remits).toHaveLength(2)
  })

  it('round-trips launch draft without File blobs', () => {
    const withFile = {
      ...draft,
      imageFile: { name: 'skip.png' } as unknown as File,
    }
    saveDraft(withFile)
    const loaded = loadDraft()
    expect(loaded).not.toBeNull()
    expect(loaded?.ticker).toBe('DRFT')
    expect(loaded?.mode).toBe('buyback')
    expect(loaded?.buybackRule?.dipPct).toBe(22)
    expect(loaded?.crew).toHaveLength(2)
    expect(loaded?.crew[0].hireRole).toBe('chart')
    expect(loaded?.imageFile).toBeNull()
    expect(localStorage.getItem(DRAFT_KEY)).toBeTruthy()
  })

  it('round-trips UI selectedMint', () => {
    saveUiPrefs({ selectedMint: coin.mint })
    expect(loadUiPrefs().selectedMint).toBe(coin.mint)
    expect(localStorage.getItem(UI_KEY)).toContain(coin.mint)
  })

  it('migrates legacy board keys into STORE_KEY once', () => {
    const legacyKey = STORE_LEGACY_KEYS[0]
    localStorage.setItem(
      legacyKey,
      JSON.stringify({ coins: [coin], remits: [remit] }),
    )
    const loaded = loadBoard()
    expect(loaded.coins[0].ticker).toBe('PERS')
    expect(localStorage.getItem(STORE_KEY)).toBeTruthy()
    expect(localStorage.getItem(legacyKey)).toBeNull()
  })

  it('heals corrupt board JSON by reseeding empty production board', () => {
    localStorage.setItem(STORE_KEY, '{not-json')
    const loaded = loadBoard()
    expect(loaded.coins).toEqual([])
    expect(loaded.remits).toEqual([])
    expect(localStorage.getItem(STORE_KEY)).toBeTruthy()
  })

  it('drops unknown modes on load and rewrites healed board', () => {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        coins: [
          coin,
          { ...coin, id: 'bad', mode: 'evil', ticker: 'BAD' },
        ],
        remits: [{ ...remit, mode: 'nope' }],
      }),
    )
    const loaded = loadBoard()
    expect(loaded.coins).toHaveLength(1)
    expect(loaded.remits).toHaveLength(0)
    const rewritten = JSON.parse(localStorage.getItem(STORE_KEY)!)
    expect(rewritten.coins).toHaveLength(1)
    expect(rewritten.remits).toHaveLength(0)
  })

  it('survives QuotaExceeded on write without throwing', () => {
    const boom = new Error('QuotaExceededError')
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw boom
    })
    expect(() => saveBoard({ coins: [coin], remits: [] })).not.toThrow()
    expect(() => saveDraft(draft)).not.toThrow()
    expect(() => saveUiPrefs({ selectedMint: coin.mint })).not.toThrow()
  })

  it('resetBoard reseeds and clearDraft/clearAll wipe keys', () => {
    saveBoard({ coins: [coin], remits: [remit] })
    saveDraft(draft)
    saveUiPrefs({ selectedMint: coin.mint })
    localStorage.setItem(STORE_LEGACY_KEYS[1], '{"coins":[],"remits":[]}')

    const reset = resetBoard()
    expect(reset.coins).toEqual([])
    expect(localStorage.getItem(STORE_KEY)).toBeTruthy()

    clearDraft()
    expect(loadDraft()).toBeNull()

    clearAllPersistence()
    expect(localStorage.getItem(STORE_KEY)).toBeNull()
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
    expect(localStorage.getItem(UI_KEY)).toBeNull()
    for (const key of STORE_LEGACY_KEYS) {
      expect(localStorage.getItem(key)).toBeNull()
    }
  })
})
