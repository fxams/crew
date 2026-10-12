import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import bs58 from 'bs58'
import { Keypair } from '@solana/web3.js'
import {
  assertBagsClaimerLimit,
  bagsApiFailureMessage,
  bagsFeeShareConfigBody,
  bagsTxToStep,
  buildBagsUnsignedLaunch,
  createBagsFeeShareConfig,
  normalizeBagsClaimers,
  setBagsHttpForTests,
  setBagsLamportsForTests,
} from './bags.js'
import {
  BAGS_DEFAULT_CONFIG_TYPE,
  BAGS_MAX_CLAIMERS,
  BAGS_MAX_CLAIMERS_NON_LUT,
  BAGS_PUBLIC_LUT,
} from './platforms.js'

const desk = Keypair.generate().publicKey.toBase58()
const kol = Keypair.generate().publicKey.toBase58()
const treas = Keypair.generate().publicKey.toBase58()

function fakeTxBase58(): string {
  // 64-byte dummy payload — bagsTxToStep tolerates deserialize failure
  return bs58.encode(Buffer.alloc(128, 2))
}

beforeEach(() => {
  setBagsLamportsForTests(async () => 1e9)
})

afterEach(() => {
  setBagsHttpForTests(null)
  setBagsLamportsForTests(null)
  delete process.env.BAGS_API_KEY
})

describe('Bags.fm unsigned launch', () => {
  it('enforces the 100-claimer hard cap', () => {
    expect(() => assertBagsClaimerLimit([])).toThrow(/at least one/)
    expect(() => assertBagsClaimerLimit(Array.from({ length: BAGS_MAX_CLAIMERS + 1 }, () => desk))).toThrow(
      /100 fee claimers/,
    )
    expect(() => assertBagsClaimerLimit(Array.from({ length: 3 }, () => desk))).not.toThrow()
  })

  it('converts Bags base58 txs into signable steps', () => {
    const step = bagsTxToStep('create', fakeTxBase58(), desk)
    expect(step.encoding).toBe('solana-tx')
    expect(step.requiredSigners).toEqual([desk])
    expect(step.transactionBase64).toBeTruthy()
    expect(step.messageBase64).toBeTruthy()
  })

  it('normalizes unique claimers, 10000 bps, and the SDK default bagsConfigType', () => {
    const { body, usedLookupTable } = bagsFeeShareConfigBody({
      payer: desk,
      baseMint: kol,
      claimers: [kol, desk, treas],
      basisPoints: [6000, 1500, 2500],
    })
    expect(body.payer).toBe(desk)
    expect(body.baseMint).toBe(kol)
    expect(body.claimersArray).toEqual([kol, desk, treas])
    expect(body.basisPointsArray).toEqual([6000, 1500, 2500])
    expect(body.bagsConfigType).toBe(BAGS_DEFAULT_CONFIG_TYPE)
    expect(usedLookupTable).toBe(false)
    expect(body.additionalLookupTables).toBeUndefined()

    const merged = normalizeBagsClaimers([desk, desk, kol], [1500, 1000, 7500])
    expect(merged.claimers).toEqual([desk, kol])
    expect(merged.basisPoints).toEqual([2500, 7500])
    expect(() => normalizeBagsClaimers([desk], [9999])).toThrow(/10000/)
  })

  it('builds fee-share + create steps with 60/15/25 claimers (mocked HTTP)', async () => {
    process.env.BAGS_API_KEY = 'test-bags-key'
    const calls: Array<{ url: string; body: unknown }> = []
    setBagsHttpForTests(async (url, init) => {
      const path = String(url)
      let parsed: unknown = null
      if (typeof init?.body === 'string') {
        parsed = JSON.parse(init.body)
        calls.push({ url: path, body: parsed })
      } else {
        calls.push({ url: path, body: init?.body ? 'form' : null })
      }
      if (path.includes('create-token-info')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({}),
          text: async () =>
            JSON.stringify({
              success: true,
              response: { tokenMint: desk, tokenMetadata: 'https://ipfs.example/bags.json' },
            }),
        }
      }
      if (path.includes('fee-share/config')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({}),
          text: async () =>
            JSON.stringify({
              success: true,
              response: {
                needsCreation: true,
                meteoraConfigKey: kol,
                transactions: [{ transaction: fakeTxBase58() }],
              },
            }),
        }
      }
      if (path.includes('create-launch-transaction')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({}),
          text: async () => JSON.stringify({ success: true, response: fakeTxBase58() }),
        }
      }
      return { ok: false, status: 404, json: async () => ({}), text: async () => '{"success":false}' }
    })

    const shareholders = [
      { wallet: kol, bps: 6000, role: 'crew' },
      { wallet: desk, bps: 1500, role: 'desk' },
      { wallet: treas, bps: 2500, role: 'platform' },
    ]
    const plan = await buildBagsUnsignedLaunch({
      name: 'Desk Cat',
      ticker: 'DCAT',
      description: 'Launched from CrewPay.dev platform',
      launcherPubkey: desk,
      shareholders,
      crew: [{ handle: '@kol', wallet: kol, share: 100, hireRole: 'kol' }],
      imageUrl: 'https://example.com/cat.png',
    })

    expect(plan.platform).toBe('bags')
    expect(plan.mint).toBe(desk)
    expect(plan.coinUrl).toContain('bags.fm')
    expect(plan.steps).toHaveLength(2)
    expect(plan.steps[0]?.kind).toBe('fee_share_config')
    expect(plan.steps[1]?.kind).toBe('create')
    const feeBody = calls.find((c) => String(c.url).includes('fee-share/config'))?.body as {
      claimersArray: string[]
      basisPointsArray: number[]
      bagsConfigType: string
      payer: string
    }
    expect(feeBody.payer).toBe(desk)
    expect(feeBody.bagsConfigType).toBe(BAGS_DEFAULT_CONFIG_TYPE)
    expect(feeBody.basisPointsArray.reduce((s, n) => s + n, 0)).toBe(10_000)
    expect(feeBody.basisPointsArray[0]).toBe(6000)
    expect(feeBody.basisPointsArray[1]).toBe(1500)
    expect(feeBody.basisPointsArray[2]).toBe(2500)
    expect(plan.note).not.toMatch(/launcher gets 60/i)
    expect(plan.warnings?.join(' ')).toMatch(/60% to the KOL crew/)
  })

  it('attaches a LUT when claimers exceed the non-LUT limit', async () => {
    process.env.BAGS_API_KEY = 'test-bags-key'
    const wallets = Array.from({ length: BAGS_MAX_CLAIMERS_NON_LUT + 2 }, () =>
      Keypair.generate().publicKey.toBase58(),
    )
    let feeBody: Record<string, unknown> | null = null
    setBagsHttpForTests(async (url, init) => {
      const path = String(url)
      if (path.includes('create-token-info')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({}),
          text: async () =>
            JSON.stringify({ success: true, response: { tokenMint: desk, tokenMetadata: 'ipfs://x' } }),
        }
      }
      if (path.includes('fee-share/config')) {
        feeBody = JSON.parse(String(init?.body))
        return {
          ok: true,
          status: 200,
          json: async () => ({}),
          text: async () =>
            JSON.stringify({
              success: true,
              response: { needsCreation: false, meteoraConfigKey: kol },
            }),
        }
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
        text: async () => JSON.stringify({ success: true, response: fakeTxBase58() }),
      }
    })
    const bps = wallets.map((_, i) => (i === 0 ? 10_000 - (wallets.length - 1) : 1))
    await buildBagsUnsignedLaunch({
      name: 'Many',
      ticker: 'MANY',
      description: 'crew',
      launcherPubkey: desk,
      shareholders: wallets.map((wallet, i) => ({ wallet, bps: bps[i]!, role: 'crew' })),
      crew: [],
      imageUrl: 'https://example.com/a.png',
    })
    expect(feeBody?.additionalLookupTables).toEqual([BAGS_PUBLIC_LUT])
    expect(feeBody?.bagsConfigType).toBe(BAGS_DEFAULT_CONFIG_TYPE)
  })

  it('refuses an unfunded launcher before calling Bags fee-share/config', async () => {
    setBagsLamportsForTests(async () => 0)
    process.env.BAGS_API_KEY = 'test-bags-key'
    let feeShareCalled = false
    setBagsHttpForTests(async (url) => {
      if (String(url).includes('fee-share/config')) feeShareCalled = true
      return { ok: false, status: 500, json: async () => ({}), text: async () => '{"success":false}' }
    })
    await expect(
      createBagsFeeShareConfig({
        apiKey: 'test-bags-key',
        payer: desk,
        baseMint: kol,
        claimers: [kol, desk, treas],
        basisPoints: [6000, 1500, 2500],
      }),
    ).rejects.toThrow(/0 SOL/)
    expect(feeShareCalled).toBe(false)
  })

  it('maps Bags fee-share/config 500 to an unfunded / Bags-side hint', async () => {
    const msg = bagsApiFailureMessage(
      '/fee-share/config',
      500,
      { success: false },
      '{"success":false}',
    )
    expect(msg).toMatch(/Bags API \/fee-share\/config failed \(500\)/)
    expect(msg).toMatch(/0\.05 SOL/)
    expect(msg).toMatch(/Bags-side failure/)

    const fromResponse = bagsApiFailureMessage(
      '/fee-share/config',
      500,
      { success: false, response: 'payer has insufficient lamports' },
      '',
    )
    expect(fromResponse).toMatch(/insufficient lamports/)
    expect(fromResponse).toMatch(/0\.05 SOL/)
  })

  it('surfaces Bags fee-share/config 500 instead of a bare status', async () => {
    process.env.BAGS_API_KEY = 'test-bags-key'
    setBagsHttpForTests(async (url) => {
      const path = String(url)
      if (path.includes('create-token-info')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({}),
          text: async () =>
            JSON.stringify({
              success: true,
              response: { tokenMint: desk, tokenMetadata: 'https://ipfs.example/bags.json' },
            }),
        }
      }
      return {
        ok: false,
        status: 500,
        json: async () => ({}),
        text: async () => JSON.stringify({ success: false }),
      }
    })
    await expect(
      buildBagsUnsignedLaunch({
        name: 'Desk Cat',
        ticker: 'DCAT',
        description: 'Launched from CrewPay.dev platform',
        launcherPubkey: desk,
        shareholders: [
          { wallet: kol, bps: 6000, role: 'crew' },
          { wallet: desk, bps: 1500, role: 'desk' },
          { wallet: treas, bps: 2500, role: 'platform' },
        ],
        crew: [{ handle: '@kol', wallet: kol, share: 100, hireRole: 'kol' }],
        imageUrl: 'https://example.com/cat.png',
      }),
    ).rejects.toThrow(/0\.05 SOL/)
  })
})
