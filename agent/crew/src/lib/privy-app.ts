export type PrivyEnv = Record<string, string | undefined>

/** Public Privy app id. Empty means hide every Privy UI. */
export function vitePrivyAppId(env: PrivyEnv = import.meta.env as PrivyEnv): string {
  return (env.VITE_PRIVY_APP_ID || '').trim()
}

export function resolvePrivyAppId(fromApi?: string | null, env?: PrivyEnv): string {
  return vitePrivyAppId(env) || (fromApi || '').trim()
}
