import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Keypair } from '@solana/web3.js'
import type { Request, Response, NextFunction } from 'express'

vi.mock('./coins.js', () => ({
  getCoin: vi.fn(),
  listCoins: vi.fn(),
  listRemits: vi.fn(),
  upsertCoin: vi.fn(async (c: unknown) => c),
  upsertRemits: vi.fn(async () => 1),
}))

vi.mock('./pump-creator.js', () => ({
  fetchPumpBondingCurveCreator: vi.fn(),
  isValidPumpFunUrl: (url: string) => {
    try {
      const u = new URL(url)
      return u.protocol === 'https:' && (u.hostname === 'pump.fun' || u.hostname === 'www.pump.fun')
    } catch {
      return false
    }
  },
}))

vi.mock('./remits-chain.js', () => ({
  assertRemitOnChain: vi.fn(async () => undefined),
}))

vi.mock('./board-nonces.js', () => ({
  issueBoardNonce: vi.fn(async () => ({ nonce: 'n', expiresAt: Date.now() + 1 })),
  consumeBoardNonce: vi.fn(async () => true),
}))

vi.mock('./wallet-auth.js', async () => {
  const actual = await vi.importActual<typeof import('./wallet-auth.js')>('./wallet-auth.js')
  return {
    ...actual,
    requireApiKeyOrWallet: () => (_req: Request, _res: Response, next: NextFunction) => {
      next()
    },
    requireWalletSignatureOnly: () => (_req: Request, _res: Response, next: NextFunction) => {
      next()
    },
  }
})

vi.mock('./proof.js', () => ({
  enrichRemitHandle: (r: { handle: string }) => r.handle,
}))

vi.mock('./agent/constants.js', () => ({
  readPlatformBuybackWallet: () => null,
  isPlatformTreasury: () => false,
}))

import { getCoin, upsertCoin, upsertRemits } from './coins.js'
import { fetchPumpBondingCurveCreator } from './pump-creator.js'
import { assertRemitOnChain } from './remits-chain.js'
import { coinsRouter } from '../routes/coins.js'

function findRoute(method: string, path: string) {
  const layer = (
    coinsRouter as unknown as {
      stack: {
        route?: {
          path: string
          methods: Record<string, boolean>
          stack: { handle: Function }[]
        }
      }[]
    }
  ).stack.find((l) => l.route?.path === path && l.route.methods[method])
  if (!layer?.route) throw new Error(`route ${method} ${path} not found`)
  return layer.route.stack[layer.route.stack.length - 1]!.handle as (
    req: Request,
    res: Response,
    next?: NextFunction,
  ) => Promise<void>
}

function mockRes() {
  const out: {
    statusCode?: number
    body?: unknown
    status: (n: number) => typeof out
    json: (b: unknown) => typeof out
  } = {
    status(n) {
      out.statusCode = n
      return out
    },
    json(b) {
      out.body = b
      return out
    },
  }
  return out as unknown as Response & { statusCode?: number; body?: unknown }
}

function baseCoin(overrides: Record<string, unknown> = {}) {
  const mint = (overrides.mint as string) || Keypair.generate().publicKey.toBase58()
  const launcher = (overrides.launcher as string) || Keypair.generate().publicKey.toBase58()
  return {
    id: 'c1',
    mint,
    name: 'Test',
    ticker: 'TST',
    vibe: '',
    mode: 'split' as const,
    crew: [],
    signature: 'sig',
    launchedAt: Date.now(),
    launcher,
    pumpUrl: `https://pump.fun/coin/${mint}`,
    ...overrides,
  }
}

function remitBody(mint: string, extra: Record<string, unknown> = {}) {
  return {
    remits: [
      {
        id: 'r1',
        mint,
        ticker: 'TST',
        handle: '@x',
        wallet: Keypair.generate().publicKey.toBase58(),
        amountSol: 0.01,
        mode: 'split',
        at: Date.now(),
        signature: '5'.repeat(88),
        ...extra,
      },
    ],
  }
}

describe('board write lockdown', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('random wallet cannot overwrite an existing coin', async () => {
    const put = findRoute('put', '/coins')
    const launcher = Keypair.generate().publicKey.toBase58()
    const attacker = Keypair.generate().publicKey.toBase58()
    const mint = Keypair.generate().publicKey.toBase58()
    vi.mocked(getCoin).mockResolvedValue(baseCoin({ mint, launcher, name: 'Original' }) as never)

    const res = mockRes()
    const req = {
      body: baseCoin({ mint, launcher: attacker, name: 'Hijacked' }),
      crewWallet: attacker,
      header: () => undefined,
    } as unknown as Request

    await put(req, res)
    expect(res.statusCode).toBe(403)
    expect(String((res.body as { error?: string })?.error || '')).toMatch(/launcher/i)
    expect(upsertCoin).not.toHaveBeenCalled()
  })

  it('existing coin update keeps stored launcher', async () => {
    const put = findRoute('put', '/coins')
    const launcher = Keypair.generate().publicKey.toBase58()
    const mint = Keypair.generate().publicKey.toBase58()
    vi.mocked(getCoin).mockResolvedValue(baseCoin({ mint, launcher }) as never)

    const res = mockRes()
    const req = {
      body: baseCoin({ mint, launcher, name: 'Updated' }),
      crewWallet: launcher,
      header: () => undefined,
    } as unknown as Request

    await put(req, res)
    expect(upsertCoin).toHaveBeenCalled()
    const saved = vi.mocked(upsertCoin).mock.calls[0]![0] as { launcher: string; name: string }
    expect(saved.launcher).toBe(launcher)
    expect(saved.name).toBe('Updated')
    expect(fetchPumpBondingCurveCreator).not.toHaveBeenCalled()
  })

  it('new pump.fun coin requires bonding-curve creator === signer', async () => {
    const put = findRoute('put', '/coins')
    const creator = Keypair.generate().publicKey.toBase58()
    const other = Keypair.generate().publicKey.toBase58()
    const mint = Keypair.generate().publicKey.toBase58()
    vi.mocked(getCoin).mockResolvedValue(null)
    vi.mocked(fetchPumpBondingCurveCreator).mockResolvedValue(creator)

    const res = mockRes()
    await put(
      {
        body: baseCoin({ mint, launcher: other }),
        crewWallet: other,
        header: () => undefined,
      } as unknown as Request,
      res,
    )
    expect(res.statusCode).toBe(403)
    expect(String((res.body as { error?: string })?.error || '')).toMatch(/bonding-curve creator/i)
    expect(upsertCoin).not.toHaveBeenCalled()
  })

  it('new bags.fm / zora.co coins skip Pump creator check', async () => {
    const put = findRoute('put', '/coins')
    const launcher = Keypair.generate().publicKey.toBase58()
    vi.mocked(getCoin).mockResolvedValue(null)

    for (const host of ['bags.fm', 'zora.co'] as const) {
      vi.mocked(upsertCoin).mockClear()
      vi.mocked(fetchPumpBondingCurveCreator).mockClear()
      const mint = Keypair.generate().publicKey.toBase58()
      const res = mockRes()
      await put(
        {
          body: baseCoin({
            mint,
            launcher,
            pumpUrl: `https://${host}/coin/${mint}`,
          }),
          crewWallet: launcher,
          header: () => undefined,
        } as unknown as Request,
        res,
      )
      expect(fetchPumpBondingCurveCreator).not.toHaveBeenCalled()
      expect(upsertCoin).toHaveBeenCalled()
    }
  })

  it('rejects non-trade-host pumpUrl', async () => {
    const put = findRoute('put', '/coins')
    const launcher = Keypair.generate().publicKey.toBase58()
    vi.mocked(getCoin).mockResolvedValue(null)
    const res = mockRes()
    await put(
      {
        body: baseCoin({ launcher, pumpUrl: 'https://evil.example/coin/x' }),
        crewWallet: launcher,
        header: () => undefined,
      } as unknown as Request,
      res,
    )
    expect(res.statusCode).toBe(400)
    expect(String((res.body as { error?: string })?.error || '')).toMatch(/pump\.fun|bags|zora/)
    expect(upsertCoin).not.toHaveBeenCalled()
  })

  it('remit for a mint you do not own fails', async () => {
    const post = findRoute('post', '/remits')
    const owner = Keypair.generate().publicKey.toBase58()
    const stranger = Keypair.generate().publicKey.toBase58()
    const mint = Keypair.generate().publicKey.toBase58()
    vi.mocked(getCoin).mockResolvedValue(baseCoin({ mint, launcher: owner }) as never)

    const res = mockRes()
    await post(
      {
        body: remitBody(mint),
        crewWallet: stranger,
        header: () => undefined,
      } as unknown as Request,
      res,
    )
    expect(res.statusCode).toBe(403)
    expect(String((res.body as { error?: string })?.error || '')).toMatch(/launch/i)
    expect(upsertRemits).not.toHaveBeenCalled()
    expect(assertRemitOnChain).not.toHaveBeenCalled()
  })

  it('pumpfun remits require on-chain distribute proof; bags/zora skip it', async () => {
    const post = findRoute('post', '/remits')
    const owner = Keypair.generate().publicKey.toBase58()
    const mint = Keypair.generate().publicKey.toBase58()

    vi.mocked(getCoin).mockResolvedValue(
      baseCoin({ mint, launcher: owner, platform: 'pumpfun' }) as never,
    )
    const pumpRes = mockRes()
    await post(
      {
        body: remitBody(mint),
        crewWallet: owner,
        header: () => undefined,
      } as unknown as Request,
      pumpRes,
    )
    expect(assertRemitOnChain).toHaveBeenCalled()
    expect(upsertRemits).toHaveBeenCalled()

    vi.mocked(assertRemitOnChain).mockClear()
    vi.mocked(upsertRemits).mockClear()
    vi.mocked(getCoin).mockResolvedValue(
      baseCoin({ mint, launcher: owner, platform: 'bags' }) as never,
    )
    const bagsRes = mockRes()
    await post(
      {
        body: remitBody(mint),
        crewWallet: owner,
        header: () => undefined,
      } as unknown as Request,
      bagsRes,
    )
    expect(assertRemitOnChain).not.toHaveBeenCalled()
    expect(upsertRemits).toHaveBeenCalled()
  })
})
