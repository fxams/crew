const API = (
  (import.meta.env.VITE_CREW_API_URL as string | undefined)?.replace(/\/$/, '') ||
  'https://api.crewpay.dev'
)

const RETURN_KEY = 'crew_kol_return'

/** X OAuth for KOL program — wallet optional; returns via /register then hub redirect. */
export async function startKolHubXSignIn(opts?: { referralCode?: string }): Promise<void> {
  sessionStorage.setItem(RETURN_KEY, '/kol')
  const body: Record<string, string> = {}
  const ref = opts?.referralCode?.trim()
  if (ref && ref.length >= 2) body.referralCode = ref
  body.registerSrc = 'kol_hub'
  const res = await fetch(`${API}/api/kols/register/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })
  const json = (await res.json()) as { authorizeUrl?: string; error?: string }
  if (!res.ok || !json.authorizeUrl) {
    throw new Error(json.error || 'X sign-in did not start.')
  }
  window.location.assign(json.authorizeUrl)
}

export function consumeKolHubReturnPath(): string | null {
  const path = sessionStorage.getItem(RETURN_KEY)
  if (path) sessionStorage.removeItem(RETURN_KEY)
  return path
}
