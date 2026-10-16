/** Mirrors `crewpay_launchpad::curve` (fee excluded). */

export function quoteBuy(
  suiIn: bigint,
  realSui: bigint,
  realMeme: bigint,
  virtualSui: bigint,
  virtualMeme: bigint,
): bigint {
  if (suiIn <= 0n) return 0n
  const effSui = realSui + virtualSui
  const effMeme = realMeme + virtualMeme
  const newEffSui = effSui + suiIn
  const k = effSui * effMeme
  const newEffMeme = k / newEffSui
  if (newEffMeme > effMeme) return 0n
  return effMeme - newEffMeme
}

export function quoteSell(
  memeIn: bigint,
  realSui: bigint,
  realMeme: bigint,
  virtualSui: bigint,
  virtualMeme: bigint,
): bigint {
  if (memeIn <= 0n) return 0n
  const effSui = realSui + virtualSui
  const effMeme = realMeme + virtualMeme
  const newEffMeme = effMeme + memeIn
  const k = effSui * effMeme
  const newEffSui = k / newEffMeme
  if (newEffSui > effSui) return 0n
  return effSui - newEffSui
}

/** Apply trade fee bps (default 120 = 1.2%) to gross input. */
export function applyTradeFeeGross(amount: bigint, feeBps: bigint): bigint {
  const fee = (amount * feeBps) / 10_000n
  return amount - fee
}

export function minOutWithSlippage(expected: bigint, slippageBps: number): bigint {
  const bps = BigInt(Math.min(10_000, Math.max(0, slippageBps)))
  return (expected * (10_000n - bps)) / 10_000n
}
