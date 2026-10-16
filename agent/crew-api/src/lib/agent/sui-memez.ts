import { Transaction } from '@mysten/sui/transactions'
import { SUI_TYPE_ARG, toBase64 } from '@mysten/sui/utils'
import type { Shareholder } from './shareholders.js'
import type { UnsignedLaunchPlan, UnsignedStep } from './unsigned.js'
import { assertSuiEnabled, memezCustomConfigActive, suiCoinUrl, suiNetwork } from './platforms.js'
import { assertSuiAddress, isSuiAddress } from './sui-address.js'
import { CREWPAY_MEME_COIN_MODULE_BASE64 } from './sui-memez-coin-bytecode.js'
import {
  createMemezPumpSdk,
  defaultMemezConfigurationKey,
  defaultTestnetMigratorWitness,
  type MemezPumpSdk,
} from './sui-memez-client.js'

export const SUI_MEMEZ_FEE_SPLIT_GAP =
  'Blast.fun / Memez.gg default integrator config (XPUMP on testnet) does not enforce CrewPay’s 60/15/25 (or 60/15/5/20) fee map on-chain. Request a custom Memez configuration key from Interest Protocol and set MEMEZ_CONFIG_KEY to enforce splits via stake holders + fee recipients.'

export const SUI_MEMEZ_PUBLISH_NOTE =
  'Step 1 — publish IPX-compatible meme coin package. After execution, read the created TreasuryCap object id from transaction effects (owner = launcher). Pass it as treasuryCapObjectId to rebuild step 2 or call unsigned again with that field.'

export function resolveSuiCrewWallets(
  crew: { handle: string; wallet: string; share: number; evmWallet?: string }[],
  opts?: { strict?: boolean },
): { handle: string; wallet: string; share: number }[] {
  return crew.map((m) => {
    const sui = (m.wallet || '').trim()
    if (isSuiAddress(sui)) {
      return { handle: m.handle, wallet: assertSuiAddress(sui), share: m.share }
    }
    if (opts?.strict) {
      throw new Error(
        `Sui Memez launches need Sui crew wallets (0x… 32-byte). ${m.handle} has no valid Sui address in wallet.`,
      )
    }
    throw new Error(
      `Sui Memez launches need Sui crew wallets (0x…). ${m.handle} — pass crew[] with Sui addresses.`,
    )
  })
}

function shareholdersToStakeHolders(shareholders: Shareholder[]): string[] {
  const addrs = shareholders.map((s) => assertSuiAddress(s.wallet, 'stakeHolder'))
  return [...new Set(addrs)]
}

async function suiTxStep(
  kind: UnsignedStep['kind'],
  tx: Transaction,
  signer: string,
  client: { getReferenceGasPrice?: () => Promise<bigint> },
  note?: string,
): Promise<UnsignedStep> {
  const launcher = assertSuiAddress(signer, 'launcherPubkey')
  tx.setSender(launcher)
  const built = await tx.build({
    client: client as never,
    onlyTransactionKind: true,
  })
  const b64 = toBase64(built)
  return {
    kind,
    messageBase64: b64,
    transactionBase64: b64,
    recentBlockhash: '',
    lastValidBlockHeight: 0,
    requiredSigners: [launcher],
    v: 0,
    encoding: 'sui-tx',
    note,
  }
}

export function buildMemezPublishCoinTransaction(launcher: string): Transaction {
  const tx = new Transaction()
  const moduleBytes = Buffer.from(CREWPAY_MEME_COIN_MODULE_BASE64, 'base64')
  tx.publish({
    modules: [moduleBytes],
    dependencies: [],
  })
  tx.setSender(assertSuiAddress(launcher, 'launcherPubkey'))
  return tx
}

export async function buildSuiMemezCreatePoolTransaction(opts: {
  pumpSdk: MemezPumpSdk
  launcherPubkey: string
  treasuryCapObjectId: string
  name: string
  ticker: string
  metadataUri?: string
  twitter?: string
  website?: string
  shareholders: Shareholder[]
  configurationKey: string
  customConfigEnforced: boolean
}): Promise<Transaction> {
  const launcher = assertSuiAddress(opts.launcherPubkey, 'launcherPubkey')
  const treasuryCap = assertSuiAddress(opts.treasuryCapObjectId, 'treasuryCapObjectId')
  const metadata: Record<string, string> = {}
  if (opts.twitter) metadata.X = opts.twitter
  if (opts.website) metadata.Website = opts.website
  if (opts.metadataUri) metadata.imageUrl = opts.metadataUri
  metadata.name = opts.name
  metadata.symbol = opts.ticker

  const stakeHolders = opts.customConfigEnforced ? shareholdersToStakeHolders(opts.shareholders) : []

  const pumpData = await opts.pumpSdk.getPumpData({
    configurationKey: opts.configurationKey,
    totalSupply: opts.pumpSdk.defaultSupply,
    quoteCoinType: SUI_TYPE_ARG,
  })

  const tx = new Transaction()
  const { metadataCap, tx: tx2 } = await opts.pumpSdk.newPool({
    tx,
    memeCoinTreasuryCap: treasuryCap,
    totalSupply: opts.pumpSdk.defaultSupply,
    developer: launcher,
    metadata,
    configurationKey: opts.configurationKey,
    migrationWitness: defaultTestnetMigratorWitness(),
    stakeHolders,
    quoteCoinType: SUI_TYPE_ARG,
    burnTax: Number(pumpData.burnTax),
    virtualLiquidity: pumpData.virtualLiquidity,
    targetQuoteLiquidity: pumpData.targetQuoteLiquidity,
    liquidityProvision: Number(pumpData.liquidityProvision),
    isProtected: false,
  })
  tx2.transferObjects([metadataCap], tx2.pure.address(launcher))
  return tx2
}

export async function buildSuiMemezUnsignedLaunch(opts: {
  name: string
  ticker: string
  metadataUri?: string
  launcherPubkey: string
  shareholders: Shareholder[]
  treasuryCapObjectId?: string
  twitter?: string
  website?: string
}): Promise<UnsignedLaunchPlan & { followUp?: Record<string, unknown> }> {
  assertSuiEnabled()
  const launcher = assertSuiAddress(opts.launcherPubkey, 'launcherPubkey')
  const pumpSdk = createMemezPumpSdk()
  const configurationKey = defaultMemezConfigurationKey()
  const customConfigEnforced = memezCustomConfigActive()

  const warnings: string[] = []
  if (!customConfigEnforced) {
    warnings.push(SUI_MEMEZ_FEE_SPLIT_GAP)
  }

  const publishTx = buildMemezPublishCoinTransaction(launcher)
  const steps: UnsignedStep[] = [
    await suiTxStep(
      'sui_memez_publish_coin',
      publishTx,
      launcher,
      pumpSdk.client,
      SUI_MEMEZ_PUBLISH_NOTE,
    ),
  ]

  const treasuryCap = (opts.treasuryCapObjectId || '').trim()
  let followUp: Record<string, unknown> | undefined
  if (!treasuryCap) {
    followUp = {
      treasuryCapObjectId:
        'Required for step 2 — object id of TreasuryCap created in step 1 effects (total supply 0).',
      rebuild: 'POST /api/agent/launch/unsigned with the same body plus treasuryCapObjectId.',
    }
  } else {
    const poolTx = await buildSuiMemezCreatePoolTransaction({
      pumpSdk,
      launcherPubkey: launcher,
      treasuryCapObjectId: treasuryCap,
      name: opts.name,
      ticker: opts.ticker,
      metadataUri: opts.metadataUri,
      twitter: opts.twitter,
      website: opts.website,
      shareholders: opts.shareholders,
      configurationKey,
      customConfigEnforced,
    })
    steps.push(
      await suiTxStep(
        'sui_memez_create_pool',
        poolTx,
        launcher,
        pumpSdk.client,
        'Step 2 — create Memez.gg / Blast.fun pump pool (MemezPumpSDK.newPool). Sign after step 1 is confirmed.',
      ),
    )
  }

  const network = suiNetwork()
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
    warnings,
    note:
      'UNSIGNED Sui Memez (testnet) — sign sui_memez_publish_coin then sui_memez_create_pool in order. POST /api/agent/launch/submit { platform:"sui", signed:[base64…] }.',
    ...(followUp ? { followUp } : {}),
    memez: {
      network,
      configurationKey,
      customConfigEnforced,
      migratorWitness: defaultTestnetMigratorWitness(),
      quoteCoinType: SUI_TYPE_ARG,
    },
  }
}
