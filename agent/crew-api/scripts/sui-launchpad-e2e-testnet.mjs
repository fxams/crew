#!/usr/bin/env node
/**
 * Testnet-only e2e: publish meme coin, open pool, trade, graduate, migrate to Cetus.
 * Uses active `sui client` address (key in local keystore — never logged).
 */
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'
import { resolveCoinMetadataObjectId } from '../../../contracts/sui-launchpad/scripts/graphql-coin-metadata.mjs'
import { Transaction } from '@mysten/sui/transactions'
import { fromBase64 } from '@mysten/sui/utils'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'

const PKG =
  process.env.CREWPAY_LAUNCHPAD_PACKAGE_ID ||
  '0x37cf5eccf86586fb10866c4a703e2098e2462aa437cb48100c04ba5ca57e3f64'
const CONFIG_ID =
  process.env.CREWPAY_LAUNCHPAD_CONFIG_ID ||
  '0x3360244e91cdfbd66c4e7086b1f8e57659c923eb610637f0541733246282895a'
const MIG_CFG_ID =
  process.env.CREWPAY_LAUNCHPAD_MIGRATION_CONFIG_ID ||
  '0xb34df4d72ce61698ac17d81804c9af4a8d5a36c623775dc31b59209f3464b3cd'

const CETUS_GLOBAL_CONFIG = '0xc6273f844b4bc258952c4e477697aa12c918c8e08106fac6b934811298c9820a'
const CETUS_POOLS = '0x20a086e6fa0741b3ca77d033a65faf0871349b986ddbdde6fa1d85d78a5f4222'
const CLOCK = '0x6'

const CREW = '0x2222222222222222222222222222222222222222222222222222222222222222'
const TREAS = '0x3333333333333333333333333333333333333333333333333333333333333333'

const __dir = dirname(fileURLToPath(import.meta.url))
const client = new SuiClient({
  url: process.env.SUI_RPC_URL || 'https://fullnode.testnet.sui.io:443',
})

function activeAddress() {
  const out = execSync('/tmp/sui client active-address', { encoding: 'utf8' }).trim()
  return out
}

function loadKeypair(address) {
  const json = execSync(`/tmp/sui keytool export --key-identity ${address} --json 2>/dev/null`, {
    encoding: 'utf8',
  })
  const parsed = JSON.parse(json)
  const secret = parsed.exportedPrivateKey || parsed.key
  return Ed25519Keypair.fromSecretKey(secret)
}

async function signAndExecute(tx, keypair) {
  return client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showObjectChanges: true, showEffects: true },
  })
}

async function main() {
  const sender = activeAddress()
  const keypair = loadKeypair(sender)
  const agent = sender
  const bytecodePath = join(
    __dir,
    '../../../agent/crew-api/src/lib/agent/sui-memez-coin-bytecode.ts',
  )
  const src = readFileSync(bytecodePath, 'utf8')
  const m = src.match(/CREWPAY_MEME_COIN_MODULE_BASE64 =\s*\n\s*'([^']+)'/)
  if (!m) throw new Error('meme coin bytecode not found')
  const moduleBytes = fromBase64(m[1].replace(/\s+/g, ''))

  const results = { sender, packageId: PKG, configId: CONFIG_ID, migrationConfigId: MIG_CFG_ID, txs: [] }

  // 1) Publish meme coin
  let tx = new Transaction()
  tx.publish({ modules: [moduleBytes], dependencies: [] })
  tx.setSender(sender)
  let res = await signAndExecute(tx, keypair)
  results.txs.push({ step: 'publish_meme_coin', digest: res.digest })
  const published = res.objectChanges?.find((c) => c.type === 'published')
  const memePkg = published?.packageId
  const treasuryCap = res.objectChanges?.find(
    (c) => c.type === 'created' && String(c.objectType).includes('TreasuryCap'),
  )?.objectId
  const memeType = `${memePkg}::meme::MEME`
  results.memePackageId = memePkg
  results.treasuryCapId = treasuryCap
  results.memeCoinType = memeType

  // 2) Open bonding pool (low graduation target for e2e)
  tx = new Transaction()
  tx.moveCall({
    target: `${PKG}::pool::create_pool_with_recipients`,
    typeArguments: [memeType],
    arguments: [
      tx.object(CONFIG_ID),
      tx.object(treasuryCap),
      tx.pure.u64(10_000_000_000_000),
      tx.pure.u64(5_000_000_000),
      tx.pure.u64(5_000_000_000_000_000_000),
      tx.pure.u64(500_000_000), // 0.5 SUI target
      tx.pure.vector('address', [CREW]),
      tx.pure.vector('u64', [10_000]),
      tx.pure.address(agent),
      tx.pure.address(TREAS),
      tx.pure.option('address', null),
    ],
  })
  tx.setSender(sender)
  res = await signAndExecute(tx, keypair)
  results.txs.push({ step: 'open_pool', digest: res.digest })
  const poolId = res.objectChanges?.find(
    (c) => c.type === 'created' && String(c.objectType).includes('pool::Pool'),
  )?.objectId
  results.poolId = poolId

  const metadataSui = await resolveCoinMetadataObjectId('0x2::sui::SUI')
  const metadataMeme = await resolveCoinMetadataObjectId(memeType)

  // 3) Buy
  tx = new Transaction()
  const pay1 = tx.splitCoins(tx.gas, [tx.pure.u64(200_000_000)])
  tx.moveCall({
    target: `${PKG}::pool::buy`,
    typeArguments: [memeType],
    arguments: [tx.object(poolId), tx.object(CONFIG_ID), pay1, tx.pure.u64(0)],
  })
  tx.setSender(sender)
  res = await signAndExecute(tx, keypair)
  results.txs.push({ step: 'buy_1', digest: res.digest })

  // 4) Sell half meme
  tx = new Transaction()
  const memeCoin = res.objectChanges?.find(
    (c) => c.type === 'created' && String(c.objectType).includes('Coin'),
  )?.objectId
  if (memeCoin) {
    tx.moveCall({
      target: `${PKG}::pool::sell`,
      typeArguments: [memeType],
      arguments: [tx.object(poolId), tx.object(CONFIG_ID), tx.object(memeCoin), tx.pure.u64(0)],
    })
    tx.setSender(sender)
    res = await signAndExecute(tx, keypair)
    results.txs.push({ step: 'sell', digest: res.digest })
  }

  // 5) Buy to graduate
  tx = new Transaction()
  const pay2 = tx.splitCoins(tx.gas, [tx.pure.u64(400_000_000)])
  tx.moveCall({
    target: `${PKG}::pool::buy`,
    typeArguments: [memeType],
    arguments: [tx.object(poolId), tx.object(CONFIG_ID), pay2, tx.pure.u64(0)],
  })
  tx.setSender(sender)
  res = await signAndExecute(tx, keypair)
  results.txs.push({ step: 'buy_graduate', digest: res.digest })

  // 6) Migrate to Cetus
  tx = new Transaction()
  tx.moveCall({
    target: `${PKG}::pool::migrate_to_cetus`,
    typeArguments: [memeType],
    arguments: [
      tx.object(poolId),
      tx.object(MIG_CFG_ID),
      tx.object(CETUS_GLOBAL_CONFIG),
      tx.object(CETUS_POOLS),
      tx.object(metadataMeme),
      tx.object(metadataSui),
      tx.object(CLOCK),
    ],
  })
  tx.setSender(sender)
  res = await signAndExecute(tx, keypair)
  results.txs.push({ step: 'migrate_cetus', digest: res.digest })
  const locked = res.objectChanges?.find(
    (c) => c.type === 'created' && String(c.objectType).includes('LockedClmmPosition'),
  )?.objectId
  results.lockedPositionId = locked

  const outPath = '/tmp/crewpay-launchpad-e2e.json'
  writeFileSync(outPath, JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
