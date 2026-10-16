#!/usr/bin/env node
/**
 * PTB migration: launchpad begin/finish + live Cetus pool_creator (SDK testnet published-at 0x85e612…).
 */
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { Transaction } from '@mysten/sui/transactions'
import { normalizeSuiAddress } from '@mysten/sui/utils'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(join(__dirname, '../../../agent/crew-api/package.json'))
const { SuiGrpcClient } = require('@mysten/sui/grpc')

const LAUNCHPAD_PKG =
  process.env.CREWPAY_LAUNCHPAD_PUBLISHED_AT ||
  process.env.CREWPAY_LAUNCHPAD_PACKAGE_ID ||
  '0x27353b5519bc5f3c9a6d543e717a2bce7f1dd66b903f727381b3d8121f431e4c'
/** Call target: latest upgraded Cetus CLMM on testnet (SDK `clmm_pool.published_at`). */
const CETUS_PKG =
  process.env.CETUS_CLMM_PUBLISHED_AT ||
  '0x85e61285a10efc6602ab00df70a0c06357c384ef4c5633ecf73016df1500c704'
const CETUS_GLOBAL =
  process.env.CETUS_GLOBAL_CONFIG_ID ||
  '0x9774e359588ead122af1c7e7f64e14ade261cfeecdb5d0eb4a5b3b4c8ab8bd3e'
const CETUS_POOLS =
  process.env.CETUS_POOLS_ID ||
  '0x50eb61dd5928cec5ea04711a2e9b72e5237e79e9fbcd2ce3d5469dc8708e0ee2'
const CLOCK = '0x6'
const TICK_SPACING = 60
const TICK_LOWER = 4294523664
const TICK_UPPER = 443580

const grpcClient = new SuiGrpcClient({
  network: 'testnet',
  baseUrl: process.env.SUI_GRPC_URL || 'https://fullnode.testnet.sui.io:443',
})

function compareTypeStrings(a, b) {
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const c1 = a.charCodeAt(i)
    const c2 = b.charCodeAt(i)
    if (c1 < c2) return -1
    if (c1 > c2) return 1
  }
  if (a.length < b.length) return -1
  if (a.length > b.length) return 1
  return 0
}

/** Cetus `is_right_order`: typeA must be lexicographically >= typeB (defining id strings). */
function cetusTypeArgs(coinA, coinB) {
  const na =
    normalizeSuiAddress(coinA.split('::')[0]) + '::' + coinA.split('::').slice(1).join('::')
  const nb =
    normalizeSuiAddress(coinB.split('::')[0]) + '::' + coinB.split('::').slice(1).join('::')
  if (compareTypeStrings(na, nb) < 0) return [coinB, coinA]
  return [coinA, coinB]
}

function sqrtPriceX64(amountA, amountB) {
  const num = BigInt(amountB) << 128n
  const den = BigInt(amountA)
  const priceQ128 = num / den
  let z = (priceQ128 + 1n) / 2n
  let y = priceQ128
  while (z < y) {
    y = z
    z = (priceQ128 / z + z) / 2n
  }
  return y
}

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

function buildCreatePoolCall(tx, { typeA, typeB, sqrtPrice, coinA, coinB }) {
  return tx.moveCall({
    target: `${CETUS_PKG}::pool_creator::create_pool_v3`,
    typeArguments: [typeA, typeB],
    arguments: [
      tx.object(CETUS_GLOBAL),
      tx.object(CETUS_POOLS),
      tx.pure.u32(TICK_SPACING),
      tx.pure.u128(sqrtPrice),
      tx.pure.string('https://crewpay.dev/sui-launchpad'),
      tx.pure.u32(TICK_LOWER),
      tx.pure.u32(TICK_UPPER),
      coinA,
      coinB,
      tx.pure.bool(true),
      tx.object(CLOCK),
    ],
  })
}

function buildMigrationTx({ sender, poolId, memeType, suiAmount, memeAmount, cetusPoolId, treasury }) {
  const suiType = '0x2::sui::SUI'
  const [typeA, typeB] = cetusTypeArgs(memeType, suiType)
  const amountA = typeA === memeType ? BigInt(memeAmount) : BigInt(suiAmount)
  const amountB = typeB === memeType ? BigInt(memeAmount) : BigInt(suiAmount)
  const sqrtPrice = sqrtPriceX64(amountA, amountB)

  const tx = new Transaction()
  tx.setSender(sender)

  const [suiCoin, memeCoin] = tx.moveCall({
    target: `${LAUNCHPAD_PKG}::pool::begin_cetus_ptb_migration`,
    typeArguments: [memeType],
    arguments: [tx.object(poolId)],
  })

  const coinA = typeA === memeType ? memeCoin : suiCoin
  const coinB = typeB === memeType ? memeCoin : suiCoin

  const [position, leftoverA, leftoverB] = buildCreatePoolCall(tx, {
    typeA,
    typeB,
    sqrtPrice,
    coinA,
    coinB,
  })

  tx.transferObjects([leftoverA, leftoverB], sender)
  tx.transferObjects([position], treasury)

  const positionType = `${CETUS_PKG}::position::Position`
  const [positionId] = tx.moveCall({
    target: `${LAUNCHPAD_PKG}::migration_helpers::object_id`,
    typeArguments: [positionType],
    arguments: [position],
  })

  tx.moveCall({
    target: `${LAUNCHPAD_PKG}::pool::finish_cetus_ptb_migration`,
    typeArguments: [memeType],
    arguments: [
      tx.object(poolId),
      positionId,
      tx.pure.id(cetusPoolId),
      tx.pure.u128(sqrtPrice),
      tx.pure.u64(BigInt(suiAmount)),
      tx.pure.u64(BigInt(memeAmount)),
    ],
  })

  return { tx, sqrtPrice, typeA, typeB }
}

async function findCetusPoolId({ sender, poolId, memeType, suiAmount, memeAmount }) {
  const suiType = '0x2::sui::SUI'
  const [typeA, typeB] = cetusTypeArgs(memeType, suiType)
  const amountA = typeA === memeType ? BigInt(memeAmount) : BigInt(suiAmount)
  const amountB = typeB === memeType ? BigInt(memeAmount) : BigInt(suiAmount)
  const sqrtPrice = sqrtPriceX64(amountA, amountB)

  const tx = new Transaction()
  tx.setSender(sender)
  const [suiCoin, memeCoin] = tx.moveCall({
    target: `${LAUNCHPAD_PKG}::pool::begin_cetus_ptb_migration`,
    typeArguments: [memeType],
    arguments: [tx.object(poolId)],
  })
  const coinA = typeA === memeType ? memeCoin : suiCoin
  const coinB = typeB === memeType ? memeCoin : suiCoin
  buildCreatePoolCall(tx, { typeA, typeB, sqrtPrice, coinA, coinB })

  const bytes = await tx.build({ client: grpcClient })
  const sim = await grpcClient.devInspectTransactionBlock({
    transactionBlock: bytes,
    sender,
  })
  const status = sim.effects?.status?.status ?? sim.effects?.status
  if (status !== 'success') {
    throw new Error(`devInspect failed: ${JSON.stringify(sim.effects?.status ?? sim)}`)
  }
  for (const ch of sim.effects?.created ?? []) {
    const id = ch.reference?.objectId ?? ch.objectId
    if (!id) continue
    const objType = ch.objectType ?? ''
    if (String(objType).includes('cetus_clmm::pool::Pool')) return id
  }
  throw new Error('devInspect succeeded but no cetus_clmm::pool::Pool in created objects')
}

export async function migratePoolToCetusLive({ poolId, memeType, suiAmount, memeAmount, treasury }) {
  const sender = activeAddress()
  const keypair = loadKeypair(sender)
  const treasuryAddr = treasury || '0x3333333333333333333333333333333333333333333333333333333333333333'

  const cetusPoolId = await findCetusPoolId({ sender, poolId, memeType, suiAmount, memeAmount })
  const { tx, typeA, typeB, sqrtPrice } = buildMigrationTx({
    sender,
    poolId,
    memeType,
    suiAmount,
    memeAmount,
    cetusPoolId,
    treasury: treasuryAddr,
  })

  const res = await keypair.signAndExecuteTransaction({ transaction: tx, client: grpcClient })

  const out = {
    digest: res.digest,
    cetusPoolId,
    typeA,
    typeB,
    sqrtPrice: sqrtPrice.toString(),
    suiscan: `https://suiscan.xyz/testnet/tx/${res.digest}`,
    objectChanges: res.objectChanges,
  }

  const resultsPath = join(__dirname, 'e2e-testnet-results.json')
  let prior = {}
  try {
    prior = JSON.parse(readFileSync(resultsPath, 'utf8'))
  } catch {
    /* empty */
  }
  prior.ptb_migration = out
  prior.cetus_pool_id = cetusPoolId
  writeFileSync(resultsPath, JSON.stringify(prior, null, 2) + '\n')

  return out
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const poolId = process.argv[2]
  const memeType = process.argv[3]
  const suiAmount = process.argv[4] ?? '790400000'
  const memeAmount = process.argv[5] ?? '180989223542415031'
  if (!poolId || !memeType) {
    console.error('usage: migrate-live-ptb.mjs <poolId> <memeType> [suiAmount] [memeAmount]')
    process.exit(1)
  }
  migratePoolToCetusLive({ poolId, memeType, suiAmount, memeAmount })
    .then((r) => {
      console.log(JSON.stringify(r, null, 2))
    })
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
}
