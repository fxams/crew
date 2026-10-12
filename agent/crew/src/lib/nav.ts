import { kolProfilePath } from './routes'

export type HeaderKolLink = { label: 'KOL' | 'Desk'; to: string }

/** KOL info stays in the header. Desk is added once a wallet is a registered KOL. */
export function headerKolLinks(ownHandle: string | null | undefined): HeaderKolLink[] {
  const items: HeaderKolLink[] = [{ label: 'KOL', to: '/register' }]
  const handle = ownHandle?.trim()
  if (handle) items.push({ label: 'Desk', to: kolProfilePath(handle) })
  return items
}
