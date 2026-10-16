#!/usr/bin/env node
/** Testnet proof: publish, open pool, buy-to-graduate (no sell), migrate via GraphQL metadata. */
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { resolveCoinMetadataObjectId } from './graphql-coin-metadata.mjs'

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), '../../../agent/crew-api/package.json'))
const { SuiGrpcClient } = require('@mysten/sui/grpc')
const { Transaction } = require('@mysten/sui/transactions')
const { fromBase64 } = require('@mysten/sui/utils')
const { Ed25519Keypair } = require('@mysten/sui/keypairs/ed25519')

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
const grpcClient = new SuiGrpcClient({
  network: 'testnet',
  baseUrl: process.env.SUI_GRPC_URL || 'https://fullnode.testnet.sui.io:443',
})

function activeAddress() {
  return execSync('/tmp/sui client active-address', { encoding: 'utf8' }).trim()
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
  return keypair.signAndExecuteTransaction({ transaction: tx, client: grpcClient })
}

async function main() {
  const sender = activeAddress()
  const keypair = loadKeypair(sender)
  const bytecodePath = join(__dir, '../../../agent/crew-api/src/lib/agent/sui-memez-coin-bytecode.ts')
  const src = readFileSync(bytecodePath, 'utf8')
  const m = src.match(/CREWPAY_MEME_COIN_MODULE_BASE64 =\s*\n\s*'([^']+)'/)
  if (!m) throw new Error('meme coin bytecode not found')
  const moduleBytes = fromBase64(m[1].replace(/\s+/g, ''))

  let tx = new Transaction()
  tx.publish({ modules: [moduleBytes], dependencies: [] })
  tx.setSender(sender)
  let res = await signAndExecute(tx, keypair)
  const published = res.objectChanges?.find((c) => c.type === 'published')
  const memePkg = published?.packageId
  const treasuryCap = res.objectChanges?.find(
    (c) => c.type === 'created' && String(c.objectType).includes('TreasuryCap'),
  )?.objectId
  const memeType = `${memePkg}::meme::MEME`

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
      tx.pure.u64(500_000_000),
      tx.pure.vector('address', [CREW]),
      tx.pure.vector('u64', [10_000]),
      tx.pure.address(sender),
      tx.pure.address(TREAS),
      tx.pure.option('address', null),
    ],
  })
  tx.setSender(sender)
  res = await signAndExecute(tx, keypair)
  const poolId = res.objectChanges?.find(
    (c) => c.type === 'created' && String(c.objectType).includes('pool::Pool'),
  )?.objectId

  tx = new Transaction()
  const pay = tx.splitCoins(tx.gas, [tx.pure.u64(600_000_000)])
  tx.moveCall({
    target: `${PKG}::pool::buy`,
    typeArguments: [memeType],
    arguments: [tx.object(poolId), tx.object(CONFIG_ID), pay, tx.pure.u64(0)],
  })
  tx.setSender(sender)
  res = await signAndExecute(tx, keypair)

  const metadataSui = await resolveCoinMetadataObjectId('0x2::sui::SUI')
  const metadataMeme = await resolveCoinMetadataObjectId(memeType)

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

  const locked = res.objectChanges?.find(
    (c) => c.type === 'created' && String(c.objectType).includes('LockedClmmPosition'),
  )?.objectId
  const cetusPool = res.objectChanges?.find(
    (c) => c.type === 'created' && String(c.objectType).includes('cetus_clmm::pool::Pool'),
  )?.objectId

  const out = {
    poolId,
    memeCoinType: memeType,
    metadataSui,
    metadataMeme,
    migrateDigest: res.digest,
    lockedPositionId: locked,
    cetusPoolId: cetusPool,
    suiscan: `https://suiscan.xyz/testnet/tx/${res.digest}`,
  }
  console.log(JSON.stringify(out, null, 2))
  return out
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
