/** Public Privy app id. Empty means hide every Privy UI. */
export function vitePrivyAppId(): string {
  return ((import.meta.env.VITE_PRIVY_APP_ID as string | undefined) || '').trim()
}

export function resolvePrivyAppId(fromApi?: string | null): string {
  return vitePrivyAppId() || (fromApi || '').trim()
}
