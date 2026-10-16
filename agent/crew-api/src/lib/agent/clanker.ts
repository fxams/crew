import { assertEvmAddress, isEvmAddress } from './evm-address.js'
import type { Shareholder } from './shareholders.js'
import type { Eip1559Tx, UnsignedLaunchPlan, UnsignedStep } from './unsigned.js'
import {
  assertClankerEnabled,
  clankerChainId,
  clankerCoinUrl,
  clankerNetwork,
  clankerRpcUrl,
} from './platforms.js'
import { applyRegisteredEvmWallets, resolveZoraCrewWallets } from './zora.js'

export type EvmRpc = (method: string, params: unknown[]) => Promise<unknown>

let evmRpcImpl: EvmRpc | null = null

export function setClankerEvmRpcForTests(fn: EvmRpc | null): void {
  evmRpcImpl = fn
}

export type ClankerDeployCall = (token: Record<string, unknown>) => Promise<{
  address: string
  data: string
  value?: bigint
  predictedToken: string
}>

let deployCallImpl: ClankerDeployCall | null = null

export function setClankerDeployCallForTests(fn: ClankerDeployCall | null): void {
  deployCallImpl = fn
}

/** Re-export crew EVM resolution (Clanker uses the same Base addresses as Zora). */
export { applyRegisteredEvmWallets, resolveZoraCrewWallets as resolveClankerCrewWallets }

async function evmRpc(method: string, params: unknown[]): Promise<unknown> {
  if (evmRpcImpl) return evmRpcImpl(method, params)
  const res = await fetch(clankerRpcUrl(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const json = (await res.json()) as { result?: unknown; error?: { message?: string } }
  if (json.error?.message) throw new Error(`Clanker RPC ${method}: ${json.error.message}`)
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
  const chainId = clankerChainId()
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
  let gas = 2_500_000n
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
    gas = 3_000_000n
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

export const CLANKER_PROTOCOL_FEE_GAP =
  'Clanker takes a separate protocol fee on swap volume (documented ~20% of the creator LP fee layer). CrewPay maps the 60/15/25 (or 60/15/5/20 with referral) split to Clanker rewardBps only — it cannot redirect Clanker’s protocol cut.'

const MAX_REWARD_RECIPIENTS = 32

function shareholdersToClankerRewards(
  launcher: string,
  shareholders: Shareholder[],
): Array<{ admin: `0x${string}`; recipient: `0x${string}`; bps: number; token: 'Both' }> {
  if (!shareholders.length) {
    throw new Error('Clanker launch requires shareholders (crew fee map).')
  }
  if (shareholders.length > MAX_REWARD_RECIPIENTS) {
    throw new Error(`Clanker supports at most ${MAX_REWARD_RECIPIENTS} reward recipients (got ${shareholders.length}).`)
  }
  const total = shareholders.reduce((s, r) => s + r.bps, 0)
  if (total !== 10_000) {
    throw new Error(`Clanker rewardBps must total 10_000 (got ${total}).`)
  }
  const admin = assertEvmAddress(launcher) as `0x${string}`
  return shareholders.map((s) => {
    const recipient = assertEvmAddress(s.wallet) as `0x${string}`
    return {
      admin,
      recipient,
      bps: s.bps,
      token: 'Both' as const,
    }
  })
}

async function defaultDeployCall(token: Record<string, unknown>) {
  const { Clanker } = await import('clanker-sdk/v4')
  const clanker = new Clanker()
  const deployInput = (await clanker.getDeployTransaction(token as never)) as {
    address: string
    abi: readonly unknown[]
    functionName: string
    args: readonly unknown[]
    value?: bigint
    expectedAddress?: string
  }
  const viem = await import('viem')
  const data = viem.encodeFunctionData({
    abi: deployInput.abi as readonly [],
    functionName: deployInput.functionName,
    args: deployInput.args,
  })
  return {
    address: String(deployInput.address),
    abi: deployInput.abi,
    functionName: deployInput.functionName,
    args: deployInput.args,
    data,
    value: deployInput.value ?? 0n,
    predictedToken:
      typeof deployInput.expectedAddress === 'string' ? deployInput.expectedAddress : '',
  }
}

export async function buildClankerUnsignedLaunch(opts: {
  name: string
  ticker: string
  metadataUri: string
  imageUrl?: string
  launcherPubkey: string
  shareholders: Shareholder[]
  twitter?: string
  website?: string
}): Promise<UnsignedLaunchPlan> {
  assertClankerEnabled()
  const launcher = assertEvmAddress(opts.launcherPubkey, 'launcherPubkey')
  const chainId = clankerChainId()
  const network = clankerNetwork()
  const rewards = shareholdersToClankerRewards(launcher, opts.shareholders)

  const socialMediaUrls: Array<{ platform: string; url: string }> = []
  if (opts.twitter?.trim()) socialMediaUrls.push({ platform: 'x', url: opts.twitter.trim() })
  if (opts.website?.trim()) socialMediaUrls.push({ platform: 'website', url: opts.website.trim() })

  const tokenConfig: Record<string, unknown> = {
    name: opts.name,
    symbol: opts.ticker.replace(/^\$/, '').toUpperCase(),
    image: opts.imageUrl || opts.metadataUri,
    chainId,
    tokenAdmin: launcher,
    metadata: {
      description: `Launched via CrewPay — ${opts.metadataUri}`,
      ...(socialMediaUrls.length ? { socialMediaUrls } : {}),
    },
    context: {
      interface: 'crewpay',
      platform: 'crewpay.dev',
    },
    vanity: false,
    rewards: { recipients: rewards },
  }

  const deployFn = deployCallImpl || defaultDeployCall
  const deploy = await deployFn(tokenConfig)
  const data = deploy.data.startsWith('0x') ? deploy.data : `0x${deploy.data}`

  const predicted =
    deploy.predictedToken && isEvmAddress(deploy.predictedToken)
      ? assertEvmAddress(deploy.predictedToken)
      : ''

  const deployTx = await estimateEip1559(launcher, {
    to: deploy.address,
    data,
    value: deploy.value ?? 0n,
  })

  const mint = predicted || '0x0000000000000000000000000000000000000000'
  const coinUrl = predicted ? clankerCoinUrl(predicted, network) : clankerCoinUrl(mint, network)

  return {
    ok: true,
    platform: 'clanker',
    mint: predicted || mint,
    pumpUrl: coinUrl,
    coinUrl,
    steps: [
      eip1559Step(
        'clanker_deploy',
        deployTx,
        launcher,
        `Deploy Clanker v4 token with reward recipients (${opts.shareholders.length} wallets, 10_000 bps mapped).`,
      ),
    ],
    launcher,
    createdAt: Date.now(),
    encoding: 'eip1559',
    warnings: [
      `Clanker ${network} (chainId ${chainId}) — unsigned builder only; no mainnet launch is performed by CrewPay.`,
      CLANKER_PROTOCOL_FEE_GAP,
      'Reward admins are set to the launcher; recipients match the CrewPay fee map (60% crew / 15% agent / 25% treasury, or 60/15/5/20 with referral).',
    ],
    note:
      'UNSIGNED Clanker EIP-1559 deploy — sign locally (type-2), then POST /api/agent/launch/submit { platform: "clanker", signed: ["0x…"] }.',
  }
}
