/**
 * Jupiter swap helpers for CREW platform buyback (SOL → $CREW).
 * Uses lite-api.jup.ag (v1). Falls back gracefully when egress/quote fails.
 */

import {
  Connection,
  Keypair,
  VersionedTransaction,
} from '@solana/web3.js'

const SOL_MINT = 'So11111111111111111111111111111111111111112'
const QUOTE_URLS = [
  'https://lite-api.jup.ag/swap/v1/quote',
  'https://api.jup.ag/swap/v1/quote',
]
const SWAP_URLS = [
  'https://lite-api.jup.ag/swap/v1/swap',
  'https://api.jup.ag/swap/v1/swap',
]

export type JupiterQuote = {
  inputMint: string
  outputMint: string
  inAmount: string
  outAmount: string
  otherAmountThreshold: string
  swapMode: string
  slippageBps: number
  routePlan?: unknown[]
  [key: string]: unknown
}

async function fetchJson(urls: string[], init?: RequestInit): Promise<unknown> {
  let lastErr: Error | null = null
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: {
          accept: 'application/json',
          ...(init?.headers || {}),
        },
      })
      if (!res.ok) {
        lastErr = new Error(`Jupiter ${res.status} from ${url}`)
        continue
      }
      return await res.json()
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err))
    }
  }
  throw lastErr || new Error('Jupiter unreachable')
}

export async function getJupiterQuote(opts: {
  outputMint: string
  amountLamports: number
  slippageBps?: number
}): Promise<JupiterQuote> {
  const slippageBps = opts.slippageBps ?? 100
  const qs = new URLSearchParams({
    inputMint: SOL_MINT,
    outputMint: opts.outputMint,
    amount: String(Math.floor(opts.amountLamports)),
    slippageBps: String(slippageBps),
    restrictIntermediateTokens: 'true',
  })
  const urls = QUOTE_URLS.map((base) => `${base}?${qs}`)
  const data = (await fetchJson(urls)) as JupiterQuote
  if (!data?.outAmount) throw new Error('Jupiter quote missing outAmount')
  return data
}

export async function executeJupiterSwap(opts: {
  connection: Connection
  payer: Keypair
  quote: JupiterQuote
}): Promise<{ signature: string; outAmount: string }> {
  const body = {
    quoteResponse: opts.quote,
    userPublicKey: opts.payer.publicKey.toBase58(),
    wrapAndUnwrapSol: true,
    dynamicComputeUnitLimit: true,
    prioritizationFeeLamports: 'auto',
  }

  let lastErr: Error | null = null
  for (const url of SWAP_URLS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        lastErr = new Error(`Jupiter swap ${res.status}`)
        continue
      }
      const json = (await res.json()) as { swapTransaction?: string; error?: string }
      if (!json.swapTransaction) {
        lastErr = new Error(json.error || 'Jupiter swap missing transaction')
        continue
      }
      const tx = VersionedTransaction.deserialize(Buffer.from(json.swapTransaction, 'base64'))
      tx.sign([opts.payer])
      const raw = tx.serialize()
      const signature = await opts.connection.sendRawTransaction(raw, {
        skipPreflight: false,
        maxRetries: 3,
      })
      const latest = await opts.connection.getLatestBlockhash('confirmed')
      await opts.connection.confirmTransaction(
        { signature, ...latest },
        'confirmed',
      )
      return { signature, outAmount: String(opts.quote.outAmount) }
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err))
    }
  }
  throw lastErr || new Error('Jupiter swap failed')
}

export { SOL_MINT }
