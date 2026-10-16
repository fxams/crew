#!/usr/bin/env node
/**
 * Testnet: migrate an already-graduated bonding pool to Cetus (metadata via GraphQL).
 */
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), '../../../agent/crew-api/package.json'))
const { SuiGrpcClient } = require('@mysten/sui/grpc')
import { Transaction } from '@mysten/sui/transactions'
import { fromBase64 } from '@mysten/sui/utils'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { resolveCoinMetadataObjectId } from './graphql-coin-metadata.mjs'

const PKG =
  process.env.CREWPAY_LAUNCHPAD_PACKAGE_ID ||
  '0x37cf5eccf86586fb10866c4a703e2098e2462aa437cb48100c04ba5ca57e3f64'
const MIG_CFG_ID =
  process.env.CREWPAY_LAUNCHPAD_MIGRATION_CONFIG_ID ||
  '0xb34df4d72ce61698ac17d81804c9af4a8d5a36c623775dc31b59209f3464b3cd'
const POOL_ID =
  process.env.BONDING_POOL_ID ||
  '0x1a96381020d00e711316e79ef8df637859c70614d86160bc023356d3d76d7de0'
const MEME_TYPE =
  process.env.MEME_COIN_TYPE ||
  '0x4e73475e860ed2aeefaed7bece56b8719868b9fa725b19fefe559ef6471a0d84::meme::MEME'

const CETUS_GLOBAL_CONFIG = '0xc6273f844b4bc258952c4e477697aa12c918c8e08106fac6b934811298c9820a'
const CETUS_POOLS = '0x20a086e6fa0741b3ca77d033a65faf0871349b986ddbdde6fa1d85d78a5f4222'
const CLOCK = '0x6'

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

async function main() {
  const sender = activeAddress()
  const keypair = loadKeypair(sender)
  const metadataSui = await resolveCoinMetadataObjectId('0x2::sui::SUI')
  const metadataMeme = await resolveCoinMetadataObjectId(MEME_TYPE)

  const tx = new Transaction()
  tx.moveCall({
    target: `${PKG}::pool::migrate_to_cetus`,
    typeArguments: [MEME_TYPE],
    arguments: [
      tx.object(POOL_ID),
      tx.object(MIG_CFG_ID),
      tx.object(CETUS_GLOBAL_CONFIG),
      tx.object(CETUS_POOLS),
      tx.object(metadataMeme),
      tx.object(metadataSui),
      tx.object(CLOCK),
    ],
  })
  tx.setSender(sender)

  const res = await keypair.signAndExecuteTransaction({ transaction: tx, client: grpcClient })

  const locked = res.objectChanges?.find(
    (c) => c.type === 'created' && String(c.objectType).includes('LockedClmmPosition'),
  )?.objectId
  const cetusPool = res.objectChanges?.find(
    (c) => c.type === 'created' && String(c.objectType).includes('cetus_clmm::pool::Pool'),
  )?.objectId

  const out = {
    poolId: POOL_ID,
    memeCoinType: MEME_TYPE,
    metadataSui,
    metadataMeme,
    digest: res.digest,
    lockedPositionId: locked,
    cetusPoolId: cetusPool,
    suiscan: `https://suiscan.xyz/testnet/tx/${res.digest}`,
  }

  const resultsPath = join(__dir, 'e2e-testnet-results.json')
  let prior = {}
  try {
    prior = JSON.parse(readFileSync(resultsPath, 'utf8'))
  } catch {
    /* no prior file */
  }
  prior.transactions = prior.transactions || {}
  prior.transactions.migrate_cetus = res.digest
  prior.metadata_sui_object_id = metadataSui
  prior.metadata_meme_object_id = metadataMeme
  prior.cetus_pool_id = cetusPool
  prior.locked_clmm_position_id = locked
  prior.notes =
    'Migration uses GraphQL coinMetadata; Cetus create_pool_v3 dust refunds to pool treasury (not tx sender).'
  writeFileSync(resultsPath, JSON.stringify(prior, null, 2) + '\n')

  console.log(JSON.stringify(out, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
