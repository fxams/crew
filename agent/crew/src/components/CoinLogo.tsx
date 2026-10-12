import { useState } from 'react'

type Props = {
  src?: string | null
  ticker: string
  className?: string
  fallbackClassName?: string
  size?: number
}

/** Launch/Dex image, then letter avatar if missing or the image fails. */
export function CoinLogo({
  src,
  ticker,
  className = 'live-coins-logo',
  fallbackClassName = 'live-coins-logo live-coins-logo-fallback',
  size = 40,
}: Props) {
  const [broken, setBroken] = useState(false)
  const initial = (ticker || '?').slice(0, 1).toUpperCase()
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
      onError={() => setBroken(true)}
    />
  )
}
