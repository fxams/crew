import type { AnchorHTMLAttributes, MouseEvent } from 'react'
import { isMobileUserAgent } from '../lib/wallet'
import { canonicalXHttpsUrl, isXWebUrl, openXUrl } from '../lib/x-links'

type Props = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }

/**
 * X / Twitter URL: desktop keeps a new tab; iOS/Android stay in-tab so the
 * installed X app can catch the universal link (with twitter:// fallback).
 * Non-X hrefs pass through as a normal external new-tab link.
 */
export function XLink({ href, onClick, target, rel, ...rest }: Props) {
  if (!isXWebUrl(href)) {
    return (
      <a href={href} target={target ?? '_blank'} rel={rel ?? 'noreferrer'} onClick={onClick} {...rest} />
    )
  }

  const https = canonicalXHttpsUrl(href)
  const mobile = typeof navigator !== 'undefined' && isMobileUserAgent(navigator.userAgent)

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e)
    if (e.defaultPrevented || !mobile) return
    e.preventDefault()
    openXUrl(https)
  }

  return (
    <a
      href={https}
      target={mobile ? undefined : (target ?? '_blank')}
      rel={rel ?? 'noreferrer'}
      onClick={handleClick}
      data-x-link="true"
      {...rest}
    />
  )
}
