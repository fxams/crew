/**
 * Optional x402 client: sign an exact USDC payment on Base (EIP-3009) when
 * X402_EVM_PRIVATE_KEY is set. Solana USDC is accepted by the API; this MCP
 * package signs Base. Never log the private key.
 */

export type X402Accept = {
  scheme?: string
  network?: string
  maxAmountRequired?: string
  payTo?: string
  asset?: string
  extra?: { name?: string; version?: string }
  maxTimeoutSeconds?: number
}

const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const BASE_CHAIN_ID = 8453

export function canX402Pay(evmPrivateKey?: string): boolean {
  const k = (evmPrivateKey || '').trim()
  return k.length >= 64
}

export function pickBaseAccept(accepts: X402Accept[]): X402Accept | null {
  return (
    accepts.find((a) => String(a.network || '').toLowerCase() === 'base' && a.payTo && a.maxAmountRequired) ||
    null
  )
}

function randomNonce(): `0x${string}` {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return `0x${Buffer.from(bytes).toString('hex')}` as `0x${string}`
}

function normalizePk(raw: string): `0x${string}` {
  const k = raw.trim()
  return (k.startsWith('0x') ? k : `0x${k}`) as `0x${string}`
}

/** Build a v1 X-PAYMENT header (base64 PaymentPayload) for Base USDC. */
export async function createXPaymentHeader(opts: {
  accepts: X402Accept[]
  evmPrivateKey: string
  nowSec?: number
}): Promise<string> {
  const accept = pickBaseAccept(opts.accepts)
  if (!accept) {
    throw new Error(
      'x402: no Base USDC option in 402 accepts[]. Set X402_EVM_PRIVATE_KEY for Base, or pass x-crew-api-key. Solana USDC signing is not bundled in crewpay-mcp — use REST X-PAYMENT or an API key.',
    )
  }
  const { privateKeyToAccount } = await import('viem/accounts')
  const account = privateKeyToAccount(normalizePk(opts.evmPrivateKey))
  const now = opts.nowSec ?? Math.floor(Date.now() / 1000)
  const validBefore = BigInt(now + Math.max(30, Number(accept.maxTimeoutSeconds || 60)))
  const nonce = randomNonce()
  const authorization = {
    from: account.address,
    to: accept.payTo as `0x${string}`,
    value: BigInt(accept.maxAmountRequired || '0'),
    validAfter: 0n,
    validBefore,
    nonce,
  }
  const signature = await account.signTypedData({
    domain: {
      name: accept.extra?.name || 'USD Coin',
      version: accept.extra?.version || '2',
      chainId: BASE_CHAIN_ID,
      verifyingContract: (accept.asset || USDC_BASE) as `0x${string}`,
    },
    types: {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    },
    primaryType: 'TransferWithAuthorization',
    message: authorization,
  })
  const payload = {
    x402Version: 1,
    scheme: accept.scheme || 'exact',
    network: 'base',
    payload: {
      signature,
      authorization: {
        from: authorization.from,
        to: authorization.to,
        value: authorization.value.toString(),
        validAfter: '0',
        validBefore: validBefore.toString(),
        nonce,
      },
    },
  }
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')
}
