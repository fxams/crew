import { afterEach, describe, expect, it } from 'vitest'
import bs58 from 'bs58'
import { Keypair } from '@solana/web3.js'
import {
  assertBagsClaimerLimit,
  bagsTxToStep,
  buildBagsUnsignedLaunch,
  setBagsHttpForTests,
} from './bags.js'
import { BAGS_MAX_CLAIMERS, BAGS_MAX_CLAIMERS_NON_LUT } from './platforms.js'

const desk = Keypair.generate().publicKey.toBase58()
const kol = Keypair.generate().publicKey.toBase58()
const treas = Keypair.generate().publicKey.toBase58()

function fakeTxBase58(): string {
  // 64-byte dummy payload — bagsTxToStep tolerates deserialize failure
  return bs58.encode(Buffer.alloc(128, 2))
}

afterEach(() => {
  setBagsHttpForTests(null)
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
    }
    expect(feeBody.basisPointsArray.reduce((s, n) => s + n, 0)).toBe(10_000)
    expect(feeBody.basisPointsArray[0]).toBe(6000)
    expect(feeBody.basisPointsArray[1]).toBe(1500)
    expect(feeBody.basisPointsArray[2]).toBe(2500)
    expect(plan.note).not.toMatch(/launcher gets 60/i)
    expect(plan.warnings?.join(' ')).toMatch(/60% hired KOL crew/)
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
    expect(Array.isArray(feeBody?.additionalLookupTables)).toBe(true)
  })
})
