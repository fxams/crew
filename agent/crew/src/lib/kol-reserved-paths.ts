/** /kol/<word> segments that are product routes, never X handles. */
export const KOL_RESERVED_PATH_WORDS = [
  'tasks',
  'leaderboard',
  'founders',
  'alerts',
  'battles',
  'me',
  'hub',
  'card',
  'settings',
  'register',
  'login',
  'logout',
  'signin',
  'signup',
  'auth',
  'oauth',
  'callback',
  'admin',
  'api',
  'home',
  'board',
  'desk',
  'profile',
  'notifications',
  'notifs',
  'share',
  'download',
  'wallet',
  'payout',
  'onboarding',
  'today',
  'verify',
  'claim',
  'referrals',
  'referral',
  'invite',
  'season',
  'pool',
  'program',
  'index',
  'status',
  'help',
  'support',
  'about',
] as const

export type KolReservedPathWord = (typeof KOL_RESERVED_PATH_WORDS)[number]

const RESERVED = new Set<string>(KOL_RESERVED_PATH_WORDS)

export function isKolReservedPathWord(word: string | null | undefined): boolean {
  const w = String(word || '')
    .replace(/^@+/, '')
    .trim()
    .toLowerCase()
  return RESERVED.has(w)
}
