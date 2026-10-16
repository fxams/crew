import { Transaction } from '@mysten/sui/transactions'
import type { Shareholder } from './shareholders.js'
import type { UnsignedLaunchPlan, UnsignedStep } from './unsigned.js'
import {
  assertSuiEnabled,
  cetusTestnetGlobalConfigId,
  cetusTestnetPoolsId,
  crewpayLaunchpadConfigId,
  crewpayLaunchpadMigrationConfigId,
  crewpayLaunchpadPackageId,
  SUI_CLOCK_OBJECT_ID,
  suiCoinUrl,
  suiNetwork,
} from './platforms.js'
import {
  resolveCoinMetadataObjectId,
  resolveSuiCoinMetadataObjectId,
} from './sui-coin-metadata.js'
import { assertSuiAddress } from './sui-address.js'
import { CREWPAY_MEME_COIN_MODULE_BASE64 } from './sui-memez-coin-bytecode.js'
import { buildMemezPublishCoinTransaction, resolveSuiCrewWallets } from './sui-memez.js'
import { suiTxStep } from './sui-tx.js'

export { resolveSuiCrewWallets }

export const SUI_LAUNCHPAD_PUBLISH_NOTE =
  'Step 1 — publish meme coin package. Read TreasuryCap object id from effects, then rebuild with treasuryCapObjectId for step 2.'

export const SUI_LAUNCHPAD_OPEN_NOTE =
  'Step 2 — CrewPay launchpad create_pool_with_recipients. On-chain trade fees enforce 60/15/25 (or 60/15/5/20 with referrer).'

export const SUI_LAUNCHPAD_MIGRATE_NOTE =
  'Graduated pool — migrate reserves to Cetus CLMM; LP locked on-chain. Cetus create_pool_v3 dust refunds go to the pool treasury address.'

const DEFAULT_SUPPLY = 1_000_000_000_000_000_000n
const DEFAULT_VIRTUAL_SUI = 5_000_000_000n
const DEFAULT_VIRTUAL_MEME = 5_000_000_000_000_000_000n
const DEFAULT_TARGET_SUI = 1_000_000_000_000n

function shareholdersToCrewVectors(shareholders: Shareholder[]): {
  crew: string[]
  crewWeightBps: number[]
  agent: string
  treasury: string
  referrer: string | null
} {
  const crewRows = shareholders.filter((s) => s.role !== 'desk' && s.role !== 'platform' && s.role !== 'agent-referral')
  const desk = shareholders.find((s) => s.role === 'desk')
  const platform = shareholders.find((s) => s.role === 'platform')
  const ref = shareholders.find((s) => s.role === 'agent-referral')
  if (!desk || !platform) {
    throw new Error('CrewPay launchpad requires desk (agent) and platform (treasury) shareholders.')
  }
  const crew = crewRows.length ? crewRows : [{ wallet: desk.wallet, bps: 6000 }]
  const crewWeightBps = crew.map((c) => c.bps)
  const weightSum = crewWeightBps.reduce((a, b) => a + b, 0)
  if (weightSum !== 10_000) {
    throw new Error(`Crew weight bps within the 60% slice must total 10_000 (got ${weightSum}).`)
  }
  return {
    crew: crew.map((c) => assertSuiAddress(c.wallet, 'crew')),
    crewWeightBps,
    agent: assertSuiAddress(desk.wallet, 'agent'),
    treasury: assertSuiAddress(platform.wallet, 'treasury'),
    referrer: ref ? assertSuiAddress(ref.wallet, 'referrer') : null,
  }
}

export function buildLaunchpadOpenPoolTransaction(opts: {
  launcherPubkey: string
  treasuryCapObjectId: string
  memeCoinType: string
  shareholders: Shareholder[]
  supply?: bigint
  virtualSui?: bigint
  virtualMeme?: bigint
  targetSui?: bigint
}): Transaction {
  const packageId = crewpayLaunchpadPackageId()
  const configId = crewpayLaunchpadConfigId()
  const { crew, crewWeightBps, agent, treasury, referrer } = shareholdersToCrewVectors(opts.shareholders)
  const tx = new Transaction()
  tx.moveCall({
    target: `${packageId}::pool::create_pool_with_recipients`,
    typeArguments: [opts.memeCoinType],
    arguments: [
      tx.object(configId),
      tx.object(opts.treasuryCapObjectId),
      tx.pure.u64(opts.supply ?? DEFAULT_SUPPLY),
      tx.pure.u64(opts.virtualSui ?? DEFAULT_VIRTUAL_SUI),
      tx.pure.u64(opts.virtualMeme ?? DEFAULT_VIRTUAL_MEME),
      tx.pure.u64(opts.targetSui ?? DEFAULT_TARGET_SUI),
      tx.pure.vector('address', crew),
      tx.pure.vector('u64', crewWeightBps),
      tx.pure.address(agent),
      tx.pure.address(treasury),
      tx.pure.option('address', referrer),
    ],
  })
  tx.setSender(assertSuiAddress(opts.launcherPubkey, 'launcherPubkey'))
  return tx
}

export async function buildLaunchpadMigrateTransaction(opts: {
  launcherPubkey: string
  poolObjectId: string
  memeCoinType: string
  metadataMemeObjectId?: string
  metadataSuiObjectId?: string
}): Promise<Transaction> {
  assertSuiEnabled()
  suiNetwork()
  const packageId = crewpayLaunchpadPackageId()
  const migCfg = crewpayLaunchpadMigrationConfigId()
  const metadataMeme =
    opts.metadataMemeObjectId?.trim() ||
    (await resolveCoinMetadataObjectId(opts.memeCoinType))
  const metadataSui = opts.metadataSuiObjectId?.trim() || (await resolveSuiCoinMetadataObjectId())
  const tx = new Transaction()
  tx.moveCall({
    target: `${packageId}::pool::migrate_to_cetus`,
    typeArguments: [opts.memeCoinType],
    arguments: [
      tx.object(opts.poolObjectId),
      tx.object(migCfg),
      tx.object(cetusTestnetGlobalConfigId()),
      tx.object(cetusTestnetPoolsId()),
      tx.object(metadataMeme),
      tx.object(metadataSui),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  })
  tx.setSender(assertSuiAddress(opts.launcherPubkey, 'launcherPubkey'))
  return tx
}

/** Predict meme coin type after publishing the embedded crewpay_meme_coin module. */
export function predictMemeCoinType(publishedPackageId: string): string {
  const pkg = assertSuiAddress(publishedPackageId, 'packageId')
  return `${pkg}::meme::MEME`
}

export async function buildSuiLaunchpadUnsignedLaunch(opts: {
  name: string
  ticker: string
  launcherPubkey: string
  shareholders: Shareholder[]
  treasuryCapObjectId?: string
  publishedPackageId?: string
}): Promise<UnsignedLaunchPlan & { followUp?: Record<string, unknown> }> {
  assertSuiEnabled()
  const launcher = assertSuiAddress(opts.launcherPubkey, 'launcherPubkey')
  const packageId = crewpayLaunchpadPackageId()
  const configId = crewpayLaunchpadConfigId()

  const publishTx = buildMemezPublishCoinTransaction(launcher)
  const steps: UnsignedStep[] = [
    await suiTxStep('sui_launchpad_publish_coin', publishTx, launcher, SUI_LAUNCHPAD_PUBLISH_NOTE),
  ]

  const treasuryCap = (opts.treasuryCapObjectId || '').trim()
  const publishedPkg = (opts.publishedPackageId || '').trim()
  let followUp: Record<string, unknown> | undefined

  if (!treasuryCap) {
    followUp = {
      treasuryCapObjectId: 'From step 1 publish effects (TreasuryCap owned by launcher).',
      publishedPackageId: 'Package id from step 1 publish effects — used to derive meme coin type.',
      rebuild: 'POST /api/agent/launch/unsigned with treasuryCapObjectId and publishedPackageId.',
    }
  } else {
    const memeType = publishedPkg
      ? predictMemeCoinType(publishedPkg)
      : (process.env.CREWPAY_LAUNCHPAD_MEME_COIN_TYPE || '').trim()
    if (!memeType) {
      throw new Error('publishedPackageId or CREWPAY_LAUNCHPAD_MEME_COIN_TYPE is required for launchpad step 2.')
    }
    const openTx = buildLaunchpadOpenPoolTransaction({
      launcherPubkey: launcher,
      treasuryCapObjectId: treasuryCap,
      memeCoinType: memeType,
      shareholders: opts.shareholders,
    })
    steps.push(
      await suiTxStep('sui_launchpad_open_pool', openTx, launcher, SUI_LAUNCHPAD_OPEN_NOTE),
    )
  }

  return {
    ok: true,
    platform: 'sui',
    mint: treasuryCap || 'pending-treasury-cap',
    pumpUrl: suiCoinUrl(treasuryCap || launcher),
    coinUrl: suiCoinUrl(treasuryCap || launcher),
    steps,
    launcher,
    createdAt: Date.now(),
    encoding: 'sui-tx',
    note:
      'UNSIGNED CrewPay Sui launchpad (testnet) — publish coin then open_pool. Fees enforced on-chain. POST /api/agent/launch/submit { platform:"sui" }.',
    launchpad: {
      backend: 'crewpay',
      network: suiNetwork(),
      packageId,
      configId,
      customConfigEnforced: true,
    },
    ...(followUp ? { followUp } : {}),
  }
}
