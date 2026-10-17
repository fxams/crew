import { kolProfilePath } from './routes'

export type HeaderKolLink = { label: 'KOL' | 'Desk' | 'My card'; to: string }

/** KOL hub + desk in header only — leaderboard/tasks live under /kol. */
export function headerKolLinks(
  ownHandle: string | null | undefined,
  opts?: { kolProgram?: boolean },
): HeaderKolLink[] {
  const items: HeaderKolLink[] = [{ label: 'KOL', to: opts?.kolProgram ? '/kol' : '/register' }]
  const handle = ownHandle?.trim()
  if (handle) {
    items.push({ label: 'My card', to: kolProfilePath(handle) })
    items.push({ label: 'Desk', to: kolProfilePath(handle) })
  }
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
