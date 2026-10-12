import { useState } from 'react'
import { coinLogoSrc } from '../lib/coin-logo'

type Props = {
  mint: string
  ticker: string
  className?: string
  fallbackClassName?: string
  size?: number
}

/** API-proxied logo (cached gateways), then letter avatar if the image fails. */
export function CoinLogo({
  mint,
  ticker,
  className = 'live-coins-logo',
  fallbackClassName = 'live-coins-logo live-coins-logo-fallback',
  size = 40,
}: Props) {
  const [broken, setBroken] = useState(false)
  const initial = (ticker || '?').slice(0, 1).toUpperCase()
  const src = mint ? coinLogoSrc(mint) : ''
  if (!src || broken) {
    return (
      <span className={fallbackClassName} aria-hidden>
        {initial}
      </span>
    )
  }
  return (
    <img
      className={className}
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => setBroken(true)}
    />
  )
}
