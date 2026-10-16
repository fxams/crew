const SUI_DECIMALS = 9

export function formatSui(mist: string | bigint, maxFrac = 4): string {
  const n = typeof mist === 'string' ? BigInt(mist) : mist
  const neg = n < 0n
  const v = neg ? -n : n
  const whole = v / 1_000_000_000n
  const frac = v % 1_000_000_000n
  const fracStr = frac.toString().padStart(SUI_DECIMALS, '0').slice(0, maxFrac).replace(/0+$/, '')
  return `${neg ? '-' : ''}${whole}${fracStr ? `.${fracStr}` : ''}`
}

export function parseSuiInput(input: string): bigint {
  const t = input.trim()
  if (!t) return 0n
  const [whole, frac = ''] = t.split('.')
  const fracPadded = (frac + '000000000').slice(0, SUI_DECIMALS)
  return BigInt(whole || '0') * 1_000_000_000n + BigInt(fracPadded)
}

export function shortAddress(addr: string, chars = 4): string {
  if (addr.length <= 10) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-chars)}`
}

export function poolDisplayName(pool: { name?: string; symbol?: string; memeCoinType: string }): string {
  if (pool.symbol) return pool.symbol
  if (pool.name) return pool.name
  const parts = pool.memeCoinType.split('::')
  return parts[parts.length - 1] || 'MEME'
}

export function stageLabel(stage: string): string {
  switch (stage) {
    case 'near_graduation':
      return 'Near graduation'
    case 'graduated':
      return 'Graduated'
    case 'migrated':
      return 'Migrated'
    default:
      return 'New'
  }
}
