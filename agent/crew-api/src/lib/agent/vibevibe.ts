import { assertEvmAddress, isEvmAddress } from './evm-address.js'
import type { Shareholder } from './shareholders.js'
import type { Eip1559Tx, UnsignedLaunchPlan, UnsignedStep } from './unsigned.js'
import {
  VIBEVIBE_CREATE_TUPLE_COMPONENTS,
  VIBEVIBE_DEFAULT_METADATA_SCHEMA_VERSION,
  VIBEVIBE_FACTORY_CREATE_SELECTOR,
  type VibevibeCreateParams,
} from './vibevibe-abi.js'
import {
  assertVibevibeEnabled,
  vibevibeChainId,
  vibevibeCoinUrl,
  vibevibeFactoryAddress,
  vibevibeNetwork,
  vibevibeRpcUrl,
} from './platforms.js'
import { applyRegisteredEvmWallets, resolveClankerCrewWallets } from './zora.js'
import { encodeAbiParameters, concat, type Hex } from 'viem'

export type EvmRpc = (method: string, params: unknown[]) => Promise<unknown>

let evmRpcImpl: EvmRpc | null = null

export function setVibevibeEvmRpcForTests(fn: EvmRpc | null): void {
  evmRpcImpl = fn
}

export type VibevibeCreateEncoder = (params: VibevibeCreateParams) => Promise<{ data: Hex; value: bigint }>

let createEncoderImpl: VibevibeCreateEncoder | null = null

export function setVibevibeCreateEncoderForTests(fn: VibevibeCreateEncoder | null): void {
  createEncoderImpl = fn
}

export { applyRegisteredEvmWallets }
export function resolveVibevibeCrewWallets(
  crew: Parameters<typeof resolveClankerCrewWallets>[0],
  opts?: Parameters<typeof resolveClankerCrewWallets>[1],
) {
  return resolveClankerCrewWallets(crew, opts)
}

export const VIBEVIBE_FEE_SPLIT_GAP = `vibe/vibe run15 exposes a single creatorFeeRecipient at launch. CrewPay maps the 60/15/25 (or 60/15/5/20) fee map to shareholders for planning and dry-run only — it is not split on-chain unless VIBEVIBE_FEE_SPLITTER_ADDRESS (or a future vibe/vibe multi-recipient launch) is used. Curve trade taxes accrue to creatorFeeRecipient; protocol fees are separate.`

async function evmRpc(method: string, params: unknown[]): Promise<unknown> {
  if (evmRpcImpl) return evmRpcImpl(method, params)
  const res = await fetch(vibevibeRpcUrl(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const json = (await res.json()) as { result?: unknown; error?: { message?: string } }
  if (json.error?.message) throw new Error(`vibe/vibe RPC ${method}: ${json.error.message}`)
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

async function estimateEip1559(from: string, call: { to: string; data: string; value?: bigint | string | number }) {
  const chainId = vibevibeChainId()
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
  let gas = 6_500_000n
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
    gas = 7_000_000n
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

async function readCreationFeeWei(factory: string): Promise<bigint> {
  try {
    const data = '0xdce0b4e4' // creationFee()
    const raw = await evmRpc('eth_call', [{ to: factory, data }, 'latest'])
    if (typeof raw === 'string' && raw.startsWith('0x')) return hexToBigInt(raw)
  } catch {
    /* fall through */
  }
  return 400_000_000_000_000n
}

export function encodeVibevibeCreateCalldata(params: VibevibeCreateParams): Hex {
  const tuple = encodeAbiParameters(
    [{ type: 'tuple', components: VIBEVIBE_CREATE_TUPLE_COMPONENTS }],
    [
      [
        params.name,
        params.symbol,
        params.metadataURI,
        params.metadataSchemaVersion,
        params.minInitialTokensOut,
        params.creatorFeeRecipient,
        0n,
        0n,
        0n,
        0n,
        params.deadline,
        0n,
        0n,
        0n,
        0n,
      ],
    ],
  )
  return concat([VIBEVIBE_FACTORY_CREATE_SELECTOR as Hex, tuple])
}

/** On-chain trade-tax recipient — single address on run15 factory. */
export function resolveVibevibeCreatorFeeRecipient(
  launcher: string,
  shareholders: Shareholder[],
): `0x${string}` {
  const splitter = (process.env.VIBEVIBE_FEE_SPLITTER_ADDRESS || '').trim()
  if (isEvmAddress(splitter)) {
    return assertEvmAddress(splitter) as `0x${string}`
  }
  void shareholders
  return assertEvmAddress(launcher) as `0x${string}`
}

export async function buildVibevibeUnsignedLaunch(opts: {
  name: string
  ticker: string
  metadataUri: string
  launcherPubkey: string
  shareholders: Shareholder[]
  initialBuyWei?: bigint
  minInitialTokensOut?: bigint
  metadataSchemaVersion?: bigint
  deadlineSec?: number
}): Promise<UnsignedLaunchPlan> {
  assertVibevibeEnabled()
  const launcher = assertEvmAddress(opts.launcherPubkey, 'launcherPubkey')
  const network = vibevibeNetwork()
  const factory = vibevibeFactoryAddress()
  const creationFee = await readCreationFeeWei(factory)
  const initialBuy = opts.initialBuyWei && opts.initialBuyWei > 0n ? opts.initialBuyWei : 0n
  const value = creationFee + initialBuy
  const creatorFeeRecipient = resolveVibevibeCreatorFeeRecipient(launcher, opts.shareholders)
  const deadline =
    BigInt(Math.floor(Date.now() / 1000) + (opts.deadlineSec ?? 3600))
  const createParams: VibevibeCreateParams = {
    name: opts.name,
    symbol: opts.ticker.replace(/^\$/, '').toUpperCase(),
    metadataURI: opts.metadataUri,
    metadataSchemaVersion: opts.metadataSchemaVersion ?? VIBEVIBE_DEFAULT_METADATA_SCHEMA_VERSION,
    minInitialTokensOut: opts.minInitialTokensOut ?? 0n,
    creatorFeeRecipient,
    deadline,
  }

  const encoded =
    createEncoderImpl
      ? await createEncoderImpl(createParams)
      : { data: encodeVibevibeCreateCalldata(createParams), value }

  const deployTx = await estimateEip1559(launcher, {
    to: factory,
    data: encoded.data,
    value: encoded.value ?? value,
  })

  const coinUrl = vibevibeCoinUrl('0x0000000000000000000000000000000000000000', network)

  const splitterSet = isEvmAddress((process.env.VIBEVIBE_FEE_SPLITTER_ADDRESS || '').trim())

  return {
    ok: true,
    platform: 'vibevibe',
    mint: '0x0000000000000000000000000000000000000000',
    pumpUrl: coinUrl,
    coinUrl,
    steps: [
      eip1559Step(
        'vibevibe_deploy',
        deployTx,
        launcher,
        `vibe/vibe factory create (run15) — creatorFeeRecipient ${creatorFeeRecipient}.`,
      ),
    ],
    launcher,
    createdAt: Date.now(),
    encoding: 'eip1559',
    warnings: [
      `Robinhood Chain ${network} (chainId ${vibevibeChainId()}) — unsigned builder only.`,
      VIBEVIBE_FEE_SPLIT_GAP,
      splitterSet
        ? 'creatorFeeRecipient points at VIBEVIBE_FEE_SPLITTER_ADDRESS — on-chain split depends on that contract.'
        : 'creatorFeeRecipient is the launcher wallet — crew/agent/treasury shares are not enforced on-chain on run15.',
      'Pin metadata via vibe/vibe prepare (Seedify Launch Metadata Authorization) before broadcast; CrewPay accepts metadataUri from your prepare flow.',
      initialBuy > 0n && (opts.minInitialTokensOut ?? 0n) === 0n
        ? 'initialBuyWei set without minInitialTokensOut — set minInitialTokensOut from vibe quote or risk revert.'
        : 'Mint address is unknown until the tx is mined; refresh via GET /api/agent/status/:mint?platform=vibevibe.',
    ],
    note:
      'UNSIGNED vibe/vibe EIP-1559 create — sign locally, then POST /api/agent/launch/submit { platform: "vibevibe", signed: ["0x…"] }.',
  }
}
