import { Transaction } from '@mysten/sui/transactions'
import { normalizeSuiAddress } from '@mysten/sui/utils'
import {
  cetusSdkTestnetClmmPublishedAt,
  cetusSdkTestnetGlobalConfigId,
  cetusSdkTestnetPoolsId,
  crewpayLaunchpadPublishedAt,
  SUI_CLOCK_OBJECT_ID,
} from './platforms.js'

const CETUS_TYPE_ORIGIN =
  process.env.CETUS_TYPE_ORIGIN?.trim() ||
  '0x0c7ae833c220aa73a3643a0d508afa4ac5d50d97312ea4584e35f9eb21b9df12'
const CETUS_TICK_SPACING = 60
const POOL_URL = 'https://crewpay.dev/sui-launchpad'

function compareTypeStrings(a: string, b: string): number {
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

export function cetusCoinTypeOrder(coinA: string, coinB: string): [string, string] {
  const na =
    normalizeSuiAddress(coinA.split('::')[0]) + '::' + coinA.split('::').slice(1).join('::')
  const nb =
    normalizeSuiAddress(coinB.split('::')[0]) + '::' + coinB.split('::').slice(1).join('::')
  if (compareTypeStrings(na, nb) < 0) return [coinB, coinA]
  return [coinA, coinB]
}

export function sqrtPriceX64FromAmounts(amountA: bigint, amountB: bigint): bigint {
  const num = amountB << 128n
  const den = amountA
  const priceQ128 = num / den
  let z = (priceQ128 + 1n) / 2n
  let y = priceQ128
  while (z < y) {
    y = z
    z = (priceQ128 / z + z) / 2n
  }
  return y
}

export type LaunchpadLiveMigrateOpts = {
  poolObjectId: string
  memeCoinType: string
  suiReserve: bigint
  memeReserve: bigint
  metadataMemeObjectId: string
  metadataSuiObjectId: string
  refundAddress: string
}

/** Live Cetus PTB with Position sent to shared vault object address (not treasury EOA). */
export function buildLaunchpadLiveCetusMigrateTransaction(opts: LaunchpadLiveMigrateOpts): Transaction {
  const launchpadPkg = crewpayLaunchpadPublishedAt()
  const cetusPkg = cetusSdkTestnetClmmPublishedAt()
  const positionType = `${CETUS_TYPE_ORIGIN}::position::Position`
  const suiType = '0x2::sui::SUI'
  const [typeA, typeB] = cetusCoinTypeOrder(opts.memeCoinType, suiType)
  const amountA = typeA === opts.memeCoinType ? opts.memeReserve : opts.suiReserve
  const amountB = typeB === opts.memeCoinType ? opts.memeReserve : opts.suiReserve
  const sqrtPrice = sqrtPriceX64FromAmounts(amountA, amountB)

  const tx = new Transaction()
  const [tickLower, tickUpper] = tx.moveCall({
    target: `${cetusPkg}::pool_creator::full_range_tick_range`,
    arguments: [tx.pure.u32(CETUS_TICK_SPACING)],
  })
  const [suiCoin, memeCoin] = tx.moveCall({
    target: `${launchpadPkg}::pool::begin_cetus_ptb_migration`,
    typeArguments: [opts.memeCoinType],
    arguments: [tx.object(opts.poolObjectId)],
  })

  const vault = tx.moveCall({
    target: `${launchpadPkg}::pool::create_cetus_lock_vault_for_ptb`,
    typeArguments: [opts.memeCoinType],
    arguments: [tx.object(opts.poolObjectId)],
  })
  const coinA = typeA === opts.memeCoinType ? memeCoin : suiCoin
  const coinB = typeB === opts.memeCoinType ? memeCoin : suiCoin

  const [position, leftoverA, leftoverB] = tx.moveCall({
    target: `${cetusPkg}::pool_creator::create_pool_v2`,
    typeArguments: [typeA, typeB],
    arguments: [
      tx.object(cetusSdkTestnetGlobalConfigId()),
      tx.object(cetusSdkTestnetPoolsId()),
      tx.pure.u32(CETUS_TICK_SPACING),
      tx.pure.u128(sqrtPrice),
      tx.pure.string(POOL_URL),
      tickLower,
      tickUpper,
      coinA,
      coinB,
      tx.object(opts.metadataMemeObjectId),
      tx.object(opts.metadataSuiObjectId),
      tx.pure.bool(true),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  })

  const [positionId] = tx.moveCall({
    target: `${launchpadPkg}::migration_helpers::object_id`,
    typeArguments: [positionType],
    arguments: [position],
  })
  const [vaultAddr] = tx.moveCall({
    target: `${launchpadPkg}::pool::cetus_lock_vault_receive_address`,
    arguments: [vault],
  })

  tx.transferObjects([leftoverA, leftoverB], opts.refundAddress)
  tx.transferObjects([position], vaultAddr)

  tx.moveCall({
    target: `${launchpadPkg}::pool::finish_cetus_ptb_migration_locked_owned`,
    typeArguments: [opts.memeCoinType],
    arguments: [
      tx.object(opts.poolObjectId),
      vault,
      positionId,
      tx.pure.u128(sqrtPrice),
      tx.pure.u64(opts.suiReserve),
      tx.pure.u64(opts.memeReserve),
    ],
  })

  return tx
}
