import { isKolReservedPathWord } from './kol-reserved-paths'

function normalizePath(pathname: string): string {
  return (pathname || "/").replace(/\/+$/, "") || "/";
}

/** Site home. `/crew` is the optional prefix mount, not a separate page. */
export function isHomePath(pathname: string): boolean {
  const path = normalizePath(pathname);
  return path === "/" || path === "/crew";
}

/** Home never mounts the launch desk. Only `/launch` does. */
export function isLaunchPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  return path === "/launch" || path.endsWith("/launch");
}

/** Top-20 KOL directory page. */
export function isKolsPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  return path === "/kols" || path.endsWith("/kols");
}

/** KOL program hub landing (`/kol` only — not `/kol/:handle`). */
export function isKolHubPath(pathname: string): boolean {
  const path = normalizePath(pathname)
  return path === '/kol' || path.endsWith('/kol')
}

function kolSegmentFromPath(pathname: string): string | null {
  const path = normalizePath(pathname)
  const match = path.match(/(?:^|\/)kol\/([A-Za-z0-9_]{1,15})$/)
  return match?.[1] ?? null
}

/** KOL program points leaderboard (not a profile handle). */
export function isKolLeaderboardPath(pathname: string): boolean {
  const path = normalizePath(pathname)
  return path === '/kol/leaderboard' || path.endsWith('/kol/leaderboard')
}

export function isKolFoundersPath(pathname: string): boolean {
  const path = normalizePath(pathname)
  return path === '/kol/founders' || path.endsWith('/kol/founders')
}

/** Influence task ladder (not an X handle named "tasks"). */
export function isKolTasksPath(pathname: string): boolean {
  const path = normalizePath(pathname)
  return path === '/kol/tasks' || path.endsWith('/kol/tasks')
}

/** Notifications / Alerts (not an X handle named "alerts"). */
export function isKolAlertsPath(pathname: string): boolean {
  const path = normalizePath(pathname)
  return path === '/kol/alerts' || path.endsWith('/kol/alerts')
}

/** Reserved /kol/<word> with no dedicated page — bounce to the hub. */
export function isKolReservedRedirectPath(pathname: string): boolean {
  if (
    isKolLeaderboardPath(pathname) ||
    isKolFoundersPath(pathname) ||
    isKolTasksPath(pathname) ||
    isKolAlertsPath(pathname)
  ) {
    return false
  }
  const seg = kolSegmentFromPath(pathname)
  return Boolean(seg && isKolReservedPathWord(seg))
}

/** Public desk for one registered KOL: `/kol/:handle`. */
export function kolHandleFromPath(pathname: string): string | null {
  const path = normalizePath(pathname)
  if (isKolHubPath(path) || isKolFoundersPath(path)) return null
  if (isKolLeaderboardPath(path) || isKolTasksPath(path) || isKolAlertsPath(path)) return null
  const match = kolSegmentFromPath(path)
  if (!match || isKolReservedPathWord(match)) return null
  return match
}

export function kolProfilePath(username: string): string {
  const handle = username.trim().replace(/^@/, '')
  return `/kol/${encodeURIComponent(handle)}`
}

/** Claim pitch for a paid KOL: `/claim/:handle`. */
export function claimHandleFromPath(pathname: string): string | null {
  const path = normalizePath(pathname)
  const match = path.match(/(?:^|\/)claim\/([A-Za-z0-9_]{1,15})$/)
  return match?.[1] ?? null
}

export function isClaimPath(pathname: string): boolean {
  return Boolean(claimHandleFromPath(pathname))
}

/** Opt-in KOL registration portal (X + Solana). */
export function isRegisterPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  return path === "/register" || path.endsWith("/register");
}

/** Short KOL referral invite: `/r/<code>` → register with ref prefilled. */
export function referralCodeFromPath(pathname: string): string | null {
  const path = normalizePath(pathname)
  const match = path.match(/(?:^|\/)r\/([A-Za-z0-9_]{2,24})$/)
  return match?.[1]?.toLowerCase() ?? null
}

export function isReferralPath(pathname: string): boolean {
  return Boolean(referralCodeFromPath(pathname))
}

export function referralInvitePath(code: string): string {
  return `/r/${encodeURIComponent(code.trim().replace(/^@+/, '').toLowerCase())}`
}

/** Public KOL referral landing (same code as /r/:code). */
export function kolRefFromPath(pathname: string): string | null {
  const path = normalizePath(pathname)
  const match = path.match(/(?:^|\/)ref\/([A-Za-z0-9_]{2,24})$/)
  return match?.[1]?.toLowerCase() ?? null
}

export function isKolRefPath(pathname: string): boolean {
  return Boolean(kolRefFromPath(pathname))
}

export function kolRefPath(handle: string): string {
  return `/ref/${encodeURIComponent(handle.trim().replace(/^@+/, '').toLowerCase())}`
}

/** Agent API / discovery docs page. */
export function isAgentsPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  return (
    path === "/agents" ||
    path.endsWith("/agents") ||
    path === "/api" ||
    path.endsWith("/api")
  );
}

/** First-person guide: how launching agents earn the 15% desk share. */
export function isAgentsEarnPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  return path === "/agents/earn" || path.endsWith("/agents/earn");
}

/** Public buyback + remit proof page. */
export function isProofPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  return path === "/proof" || path.endsWith("/proof");
}

/** Public one-pager (PNG full-width + PDF download). Not /onepager.png or /onepager.pdf. */
export function isOnepagerPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  return path === "/onepager" || path.endsWith("/onepager");
}

/** Human approval page for agent dry-runs: `/approve/:dryRunId`. */
export function dryRunIdFromApprovePath(pathname: string): string | null {
  const path = normalizePath(pathname)
  const match = path.match(/(?:^|\/)approve\/([a-fA-F0-9]{16,64})$/)
  return match?.[1] ?? null
}

export function isApprovePath(pathname: string): boolean {
  return Boolean(dryRunIdFromApprovePath(pathname))
}

/** Public post-launch coin page: `/coin/:mint` (Solana base58 or EVM 0x). */
export function coinMintFromPath(pathname: string): string | null {
  const path = normalizePath(pathname)
  const match = path.match(
    /(?:^|\/)coin\/([1-9A-HJ-NP-Za-km-z]{32,64}|0x[a-fA-F0-9]{40})$/,
  )
  return match?.[1] ?? null
}

export function coinPagePath(mint: string): string {
  return `/coin/${encodeURIComponent(mint.trim())}`
}

export function isCoinPath(pathname: string): boolean {
  return Boolean(coinMintFromPath(pathname))
}

/** All-coins board: `/coins` (not `/coin/:mint`). */
export function isCoinsPath(pathname: string): boolean {
  const path = normalizePath(pathname)
  return path === '/coins' || path.endsWith('/coins')
}

/** CrewPay Sui bonding-curve launchpad (testnet). */
export function isSuiLaunchpadPath(pathname: string): boolean {
  const path = normalizePath(pathname)
  return path === '/sui' || path.endsWith('/sui') || path.includes('/sui/pool/')
}

export function suiPoolIdFromPath(pathname: string): string | null {
  const path = normalizePath(pathname)
  const match = path.match(/(?:^|\/)sui\/pool\/(0x[a-fA-F0-9]{64})$/)
  return match?.[1] ?? null
}

export function isSuiPoolDetailPath(pathname: string): boolean {
  return Boolean(suiPoolIdFromPath(pathname))
}

export function suiPoolDetailPath(poolId: string): string {
  return `/sui/pool/${poolId}`
}

/** Open tasks board (jobs + escrow). */
export function isTasksPath(pathname: string): boolean {
  const path = normalizePath(pathname)
  return path === '/tasks' || path.endsWith('/tasks')
}

/** Paid content jobs list (`/jobs` only — not `/jobs/:id`). */
export function isJobsListPath(pathname: string): boolean {
  const path = normalizePath(pathname)
  return path === '/jobs' || path.endsWith('/jobs')
}

/** Content job id from `/jobs/:id`. */
export function jobIdFromPath(pathname: string): string | null {
  const path = normalizePath(pathname)
  const match = path.match(/(?:^|\/)jobs\/([A-Za-z0-9_-]{8,80})$/)
  return match?.[1] ?? null
}

export function jobPagePath(jobId: string): string {
  return `/jobs/${encodeURIComponent(jobId.trim())}`
}

/** Paid content jobs board + detail. */
export function isJobsPath(pathname: string): boolean {
  return isJobsListPath(pathname) || Boolean(jobIdFromPath(pathname))
}

export function isAdminKickoffPath(pathname: string): boolean {
  const path = normalizePath(pathname)
  return path === '/admin/kickoff' || path.endsWith('/admin/kickoff')
}

/** Unlisted Farcaster / Neynar SIWN admin. Not in nav. */
export function isAdminFarcasterPath(pathname: string): boolean {
  const path = normalizePath(pathname)
  return path === '/admin/farcaster' || path.endsWith('/admin/farcaster')
}

/** Unlisted ops dashboard (admin token or approver wallet). Not in nav. */
export function isAdminOpsPath(pathname: string): boolean {
  const path = normalizePath(pathname)
  return path === '/admin/ops' || path.endsWith('/admin/ops')
}
