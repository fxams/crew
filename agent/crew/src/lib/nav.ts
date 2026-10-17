import { kolProfilePath } from './routes'

export type HeaderKolLink = { label: 'KOL' | 'Desk' | 'Leaderboard'; to: string }

/** KOL info stays in the header. Desk is added once a wallet is a registered KOL. */
export function headerKolLinks(
  ownHandle: string | null | undefined,
  opts?: { kolProgram?: boolean },
): HeaderKolLink[] {
  const items: HeaderKolLink[] = [{ label: 'KOL', to: '/register' }]
  if (opts?.kolProgram) items.push({ label: 'Leaderboard', to: '/kol/leaderboard' })
  const handle = ownHandle?.trim()
  if (handle) items.push({ label: 'Desk', to: kolProfilePath(handle) })
  return items
}

export type MobileStickyCta = {
  label: string
  action: 'register' | 'go-launch' | 'submit'
}

/** Sticky bar: Launch Coin when registered; register CTA only for logged-out desk/claim. */
export function mobileStickyCta(input: {
  registered: boolean
  hide: boolean
  deskOrClaim: boolean
  onLaunchPage: boolean
  launchLabel: string
}): MobileStickyCta | null {
  if (input.hide) return null
  if (input.registered || !input.deskOrClaim) {
    if (input.onLaunchPage) return { label: input.launchLabel, action: 'submit' }
    return { label: 'Launch Coin', action: 'go-launch' }
  }
  return { label: 'Register as KOL to get Paid', action: 'register' }
}
