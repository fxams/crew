import { Transaction } from '@mysten/sui/transactions'
import {
  applyTradeFeeGross,
  minOutWithSlippage,
  quoteBuy,
  quoteSell,
} from './sui-launchpad-curve.js'
import {
  crewpayLaunchpadConfigId,
  crewpayLaunchpadPublishedAt,
} from './platforms.js'
import { assertSuiAddress } from './sui-address.js'
import { fetchBondingPoolReserves } from './sui-launchpad-pool.js'
import { suiTxStep } from './sui-tx.js'
import type { UnsignedStep } from './unsigned.js'

export type BuildTradeOpts = {
  poolObjectId: string
  memeCoinType: string
  trader: string
  side: 'buy' | 'sell'
  /** Buy: SUI mist. Sell: meme base units. */
  amount: bigint
  slippageBps: number
  tradeFeeBps: number
  /** Required for sell — user's `Coin<MEME>` object id. */
  memeCoinObjectId?: string
}

export async function buildLaunchpadTradeStep(opts: BuildTradeOpts): Promise<UnsignedStep> {
  const pkg = crewpayLaunchpadPublishedAt()
  const configId = crewpayLaunchpadConfigId()
  const trader = assertSuiAddress(opts.trader, 'trader')
  const poolId = assertSuiAddress(opts.poolObjectId, 'poolObjectId')
  const memeType = opts.memeCoinType.trim()
  const reserves = await fetchBondingPoolReserves(poolId)
  if (reserves.graduated && opts.side === 'buy') {
    throw new Error('Pool has graduated — bonding-curve buy is closed.')
  }
  if (!reserves.graduated && opts.side === 'sell' && reserves.suiReserve === 0n && reserves.memeReserve === 0n) {
    /* allow sells while trading */
  }

  const tx = new Transaction()
  const feeBps = BigInt(opts.tradeFeeBps)

  if (opts.side === 'buy') {
    const net = applyTradeFeeGross(opts.amount, feeBps)
    const expected = quoteBuy(
      net,
      reserves.suiReserve,
      reserves.memeReserve,
      reserves.virtualSui,
      reserves.virtualMeme,
    )
    const minMeme = minOutWithSlippage(expected, opts.slippageBps)
    const [pay] = tx.splitCoins(tx.gas, [opts.amount])
    const [memeOut] = tx.moveCall({
      target: `${pkg}::pool::buy`,
      typeArguments: [memeType],
      arguments: [tx.object(poolId), tx.object(configId), pay, tx.pure.u64(minMeme)],
    })
    tx.transferObjects([memeOut], trader)
  } else {
    const memeCoinId = (opts.memeCoinObjectId || '').trim()
    if (!memeCoinId) throw new Error('memeCoinObjectId is required to sell.')
    const netMeme = opts.amount
    const expectedSui = quoteSell(
      netMeme,
      reserves.suiReserve,
      reserves.memeReserve,
      reserves.virtualSui,
      reserves.virtualMeme,
    )
    const minSui = minOutWithSlippage(applyTradeFeeGross(expectedSui, feeBps), opts.slippageBps)
    const [pay] = tx.splitCoins(tx.object(memeCoinId), [netMeme])
    const [suiOut] = tx.moveCall({
      target: `${pkg}::pool::sell`,
      typeArguments: [memeType],
      arguments: [tx.object(poolId), tx.object(configId), pay, tx.pure.u64(minSui)],
    })
    tx.transferObjects([suiOut], trader)
  }

  return suiTxStep(`sui_launchpad_${opts.side}`, tx, trader)
}
