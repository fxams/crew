function normalizePath(pathname: string): string {
  return (pathname || "/").replace(/\/+$/, "") || "/";
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

/** Public desk for one registered KOL: `/kol/:handle`. */
export function kolHandleFromPath(pathname: string): string | null {
  const path = normalizePath(pathname)
  const match = path.match(/(?:^|\/)kol\/([A-Za-z0-9_]{1,15})$/)
  return match?.[1] ?? null
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

/** Public buyback + remit proof page. */
export function isProofPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  return path === "/proof" || path.endsWith("/proof");
}
