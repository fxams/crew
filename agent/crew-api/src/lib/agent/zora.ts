import { assertEvmAddress, isEvmAddress } from './evm-address.js'
import type { CrewMember } from './narrative.js'
import type { Shareholder } from './shareholders.js'
import type { Eip1559Tx, UnsignedLaunchPlan, UnsignedStep } from './unsigned.js'
import {
  assertZoraEnabled,
  getSplitsFactory,
  getZoraPlatformReferrer,
  zoraChainId,
  zoraCoinUrl,
  zoraNetwork,
  zoraRpcUrl,
} from './platforms.js'

export type EvmRpc = (method: string, params: unknown[]) => Promise<unknown>

let evmRpcImpl: EvmRpc | null = null

export function setZoraEvmRpcForTests(fn: EvmRpc | null): void {
  evmRpcImpl = fn
}

export type ZoraCreateCoinCall = (args: {
  creator: string
  name: string
  symbol: string
  uri: string
  chainId: number
  platformReferrer: string
  payoutRecipientOverride: string
}) => Promise<{
  calls: Array<{ to: string; data: string; value?: bigint | string | number }>
  predictedCoinAddress: string
}>

let createCoinCallImpl: ZoraCreateCoinCall | null = null

export function setZoraCreateCoinCallForTests(fn: ZoraCreateCoinCall | null): void {
  createCoinCallImpl = fn
}

export type SplitEncodeResult = {
  to: string
  data: string
  predictedSplit: string
}

let encodeSplitImpl: ((args: {
  recipients: Array<{ address: string; bps: number }>
  owner: string
  creator: string
  salt: string
  factory: string
}) => Promise<SplitEncodeResult>) | null = null

export function setEncodeSplitForTests(fn: NonNullable<typeof encodeSplitImpl> | null): void {
  encodeSplitImpl = fn
}

async function evmRpc(method: string, params: unknown[]): Promise<unknown> {
  if (evmRpcImpl) return evmRpcImpl(method, params)
  const res = await fetch(zoraRpcUrl(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const json = (await res.json()) as { result?: unknown; error?: { message?: string } }
  if (json.error?.message) throw new Error(`Zora RPC ${method}: ${json.error.message}`)
  return json.result
}

function hexToBigInt(hex: string | number | bigint | undefined): bigint {
  if (typeof hex === 'bigint') return hex
  if (typeof hex === 'number') return BigInt(hex)
  if (!hex) return 0n
  return BigInt(hex)
}

function toHex(n: bigint | number): string {
  return `0x${BigInt(n).toString(16)}`
}

const SPLIT_FACTORY_ABI = [
  {
    type: 'function',
    name: 'createSplitDeterministic',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: '_splitParams',
        type: 'tuple',
        components: [
          { name: 'recipients', type: 'address[]' },
          { name: 'allocations', type: 'uint256[]' },
          { name: 'totalAllocation', type: 'uint256' },
          { name: 'distributionIncentive', type: 'uint16' },
        ],
      },
      { name: '_owner', type: 'address' },
      { name: '_creator', type: 'address' },
      { name: '_salt', type: 'bytes32' },
    ],
    outputs: [{ name: 'split', type: 'address' }],
  },
  {
    type: 'function',
    name: 'predictDeterministicAddress',
    stateMutability: 'view',
    inputs: [
      {
        name: '_splitParams',
        type: 'tuple',
        components: [
          { name: 'recipients', type: 'address[]' },
          { name: 'allocations', type: 'uint256[]' },
          { name: 'totalAllocation', type: 'uint256' },
          { name: 'distributionIncentive', type: 'uint16' },
        ],
      },
      { name: '_owner', type: 'address' },
      { name: '_salt', type: 'bytes32' },
    ],
    outputs: [{ name: '', type: 'address' }],
  },
] as const

async function encodeSplit(opts: {
  recipients: Array<{ address: string; bps: number }>
  owner: string
  creator: string
  salt: string
  factory: string
}): Promise<SplitEncodeResult> {
  if (encodeSplitImpl) return encodeSplitImpl(opts)
  const viem = await import('viem')
  const recipients = opts.recipients.map((r) => assertEvmAddress(r.address))
  const allocations = opts.recipients.map((r) => BigInt(r.bps))
  const totalAllocation = allocations.reduce((s, n) => s + n, 0n)
  const splitParams = {
    recipients: recipients as `0x${string}`[],
    allocations,
    totalAllocation,
    distributionIncentive: 0,
  }
  const salt = opts.salt as `0x${string}`
  const factory = assertEvmAddress(opts.factory) as `0x${string}`
  const owner = assertEvmAddress(opts.owner) as `0x${string}`
  const creator = assertEvmAddress(opts.creator) as `0x${string}`
  const data = viem.encodeFunctionData({
    abi: SPLIT_FACTORY_ABI,
    functionName: 'createSplitDeterministic',
    args: [splitParams, owner, creator, salt],
  })
  const predictData = viem.encodeFunctionData({
    abi: SPLIT_FACTORY_ABI,
    functionName: 'predictDeterministicAddress',
    args: [splitParams, owner, salt],
  })
  const predicted = await evmRpc('eth_call', [{ to: factory, data: predictData }, 'latest'])
  const predictedSplit =
    typeof predicted === 'string' && predicted.length >= 42
      ? assertEvmAddress(`0x${predicted.slice(-40)}`)
      : ''
  if (!predictedSplit) throw new Error('0xSplits predictDeterministicAddress returned no address.')
  return { to: factory, data, predictedSplit }
}

async function defaultCreateCoinCall(args: Parameters<ZoraCreateCoinCall>[0]) {
  const sdk = await import('@zoralabs/coins-sdk')
  const createCoinCall = (
    sdk as {
      createCoinCall: (a: Record<string, unknown>) => Promise<{
        calls: Array<{ to: string; data: string; value?: bigint }>
        predictedCoinAddress: string
      }>
    }
  ).createCoinCall
  if (typeof createCoinCall !== 'function') {
    throw new Error('Zora coins SDK createCoinCall is unavailable.')
  }
  const CreateConstants = (sdk as { CreateConstants?: { ContentCoinCurrencies?: { ZORA?: string; ETH?: string } } })
    .CreateConstants
  const currency =
    zoraNetwork() === 'base'
      ? CreateConstants?.ContentCoinCurrencies?.ZORA || 'ZORA'
      : CreateConstants?.ContentCoinCurrencies?.ETH || 'ETH'
  return createCoinCall({
    creator: args.creator,
    name: args.name,
    symbol: args.symbol,
    metadata: { type: 'RAW_URI', uri: args.uri },
    currency,
    chainId: args.chainId,
    platformReferrer: args.platformReferrer,
    platformReferrerAddress: args.platformReferrer,
    payoutRecipientOverride: args.payoutRecipientOverride,
    skipMetadataValidation: true,
  })
}

async function estimateEip1559(from: string, call: { to: string; data: string; value?: bigint | string | number }) {
  const chainId = zoraChainId()
  const [nonceHex, latest, priority] = await Promise.all([
    evmRpc('eth_getTransactionCount', [from, 'pending']),
    evmRpc('eth_getBlockByNumber', ['latest', false]),
    evmRpc('eth_maxPriorityFeePerGas', []).catch(() => '0x3b9aca00'),
  ])
  const nonce = Number(hexToBigInt(String(nonceHex || '0x0')))
  const baseFee = hexToBigInt(
    (latest && typeof latest === 'object' && 'baseFeePerGas' in latest
      ? String((latest as { baseFeePerGas?: string }).baseFeePerGas)
      : '0x0') || '0x0',
  )
  const tip = hexToBigInt(String(priority || '0x3b9aca00'))
  const maxPriorityFeePerGas = tip > 0n ? tip : 1_000_000_000n
  const maxFeePerGas = baseFee * 2n + maxPriorityFeePerGas
  let gas = 400_000n
  try {
    const gasHex = await evmRpc('eth_estimateGas', [
      {
        from,
        to: call.to,
        data: call.data,
        value: typeof call.value === 'bigint' ? toHex(call.value) : call.value || '0x0',
      },
    ])
    gas = (hexToBigInt(String(gasHex || '0x0')) * 12n) / 10n
  } catch {
    gas = 500_000n
  }
  const value =
    typeof call.value === 'bigint'
      ? toHex(call.value)
      : typeof call.value === 'number'
        ? toHex(call.value)
        : String(call.value || '0x0')
  const tx: Eip1559Tx = {
    type: 2,
    chainId,
    to: assertEvmAddress(call.to),
    data: call.data.startsWith('0x') ? call.data : `0x${call.data}`,
    value,
    nonce,
    gas: toHex(gas),
    maxFeePerGas: toHex(maxFeePerGas || 1_000_000_000n),
    maxPriorityFeePerGas: toHex(maxPriorityFeePerGas),
  }
  return tx
}

function eip1559Step(kind: UnsignedStep['kind'], tx: Eip1559Tx, signer: string, note?: string): UnsignedStep {
  return {
    kind,
    messageBase64: Buffer.from(JSON.stringify(tx)).toString('base64'),
    recentBlockhash: '',
    lastValidBlockHeight: 0,
    requiredSigners: [signer],
    v: 0,
    encoding: 'eip1559',
    tx,
    note,
  }
}

export function evmLaunchPlatformLabel(platform: 'zora' | 'clanker' | 'vibevibe'): string {
  if (platform === 'clanker') return 'Clanker (Base)'
  if (platform === 'vibevibe') return 'vibe/vibe (Robinhood Chain)'
  return 'Zora (Base)'
}

/**
 * Map crew to Base payout wallets. Autohire uses strict=false (skip Solana-only rows).
 * Explicit crew[] uses strict=true (fail fast with platform-specific copy).
 */
export function resolveEvmLaunchCrewWallets(
  crew: CrewMember[],
  platform: 'zora' | 'clanker' | 'vibevibe',
  opts?: { strict?: boolean },
): CrewMember[] {
  const strict = opts?.strict !== false
  const label = evmLaunchPlatformLabel(platform)
  const out: CrewMember[] = []
  for (const m of crew) {
    if (isEvmAddress(m.wallet)) {
      out.push({ ...m, wallet: assertEvmAddress(m.wallet) })
      continue
    }
    if (m.evmWallet && isEvmAddress(m.evmWallet)) {
      const evm = assertEvmAddress(m.evmWallet)
      out.push({ ...m, wallet: evm, evmWallet: evm })
      continue
    }
    if (strict) {
      throw new Error(
        `${label} launches need EVM crew wallets. ${m.handle} has a Solana wallet — pass crew[] with Base addresses (wallet or evmWallet), or register evm_wallet for Autohire.`,
      )
    }
  }
  return out
}

export function resolveZoraCrewWallets(crew: CrewMember[], opts?: { strict?: boolean }): CrewMember[] {
  return resolveEvmLaunchCrewWallets(crew, 'zora', opts)
}

export function resolveClankerCrewWallets(crew: CrewMember[], opts?: { strict?: boolean }): CrewMember[] {
  return resolveEvmLaunchCrewWallets(crew, 'clanker', opts)
}

export function resolveVibevibeCrewWallets(crew: CrewMember[], opts?: { strict?: boolean }): CrewMember[] {
  return resolveEvmLaunchCrewWallets(crew, 'vibevibe', opts)
}

export function applyRegisteredEvmWallets(
  crew: CrewMember[],
  registered: Array<{ handle: string; wallet: string; evmWallet?: string }>,
): CrewMember[] {
  if (!registered.length) return crew
  const byHandle = new Map(
    registered
      .filter((r) => r.evmWallet && isEvmAddress(r.evmWallet))
      .map((r) => [r.handle.replace(/^@+/, '').toLowerCase(), assertEvmAddress(r.evmWallet!)]),
  )
  const byWallet = new Map(
    registered
      .filter((r) => r.evmWallet && isEvmAddress(r.evmWallet))
      .map((r) => [r.wallet, assertEvmAddress(r.evmWallet!)]),
  )
  return crew.map((m) => {
    const h = m.handle.replace(/^@+/, '').toLowerCase()
    const evm = m.evmWallet || byHandle.get(h) || byWallet.get(m.wallet)
    return evm ? { ...m, evmWallet: evm } : m
  })
}

export async function buildZoraUnsignedLaunch(opts: {
  name: string
  ticker: string
  metadataUri: string
  launcherPubkey: string
  shareholders: Shareholder[]
  initialBuySol?: number
}): Promise<UnsignedLaunchPlan> {
  assertZoraEnabled()
  const launcher = assertEvmAddress(opts.launcherPubkey, 'launcherPubkey')
  const chainId = zoraChainId()
  const network = zoraNetwork()
  const platformReferrer = getZoraPlatformReferrer()
  const factory = getSplitsFactory()
  const recipients = opts.shareholders.map((s) => ({
    address: assertEvmAddress(s.wallet),
    bps: s.bps,
  }))
  const salt = `0x${Buffer.from(`crewpay:${opts.name}:${opts.ticker}:${launcher}`).toString('hex').padEnd(64, '0').slice(0, 64)}`

  const split = await encodeSplit({
    recipients,
    owner: '0x0000000000000000000000000000000000000000',
    creator: launcher,
    salt,
    factory,
  })

  const createFn = createCoinCallImpl || defaultCreateCoinCall
  const coin = await createFn({
    creator: launcher,
    name: opts.name,
    symbol: opts.ticker.replace(/^\$/, '').toUpperCase(),
    uri: opts.metadataUri,
    chainId,
    platformReferrer,
    payoutRecipientOverride: split.predictedSplit,
  })
  const call = coin.calls[0]
  if (!call) throw new Error('Zora createCoinCall returned no factory call.')

  const splitTx = await estimateEip1559(launcher, { to: split.to, data: split.data, value: 0n })
  const createTx = await estimateEip1559(launcher, {
    to: call.to,
    data: call.data,
    value: call.value ?? 0n,
  })
  createTx.nonce = splitTx.nonce + 1

  const mint = assertEvmAddress(coin.predictedCoinAddress, 'predictedCoinAddress')
  const coinUrl = zoraCoinUrl(mint, network)
  return {
    ok: true,
    platform: 'zora',
    mint,
    pumpUrl: coinUrl,
    coinUrl,
    splitAddress: split.predictedSplit,
    steps: [
      eip1559Step(
        'split',
        splitTx,
        launcher,
        'Create 0xSplits payout recipient (60% to the KOL crew, 15% to the launching agent, 25% to the treasury). Sign+submit before the coin create.',
      ),
      eip1559Step(
        'zora_create',
        createTx,
        launcher,
        `Create Zora content coin; payoutRecipient=${split.predictedSplit}; CrewPay platformReferrer=${platformReferrer}.`,
      ),
    ],
    launcher,
    createdAt: Date.now(),
    encoding: 'eip1559',
    warnings: [
      `Zora ${network} (chainId ${chainId}) — no mainnet launch is performed by this builder.`,
      'Creator rewards go to the 0xSplits contract (60% to the KOL crew / 15% to the launching agent / 25% to the treasury). CrewPay is set as platform referrer.',
    ],
    note: 'UNSIGNED Zora EIP-1559 txs — sign locally (type-2) in order: split, then zora_create. Submit hex signed txs via POST /api/agent/launch/submit { platform: "zora" }.',
  }
}
