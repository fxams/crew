import type { LaunchDraft, LaunchResult } from './types'
import { launchDemo } from './pump/demo'
import type { MainnetLaunchCtx } from './pump/launch'

export { launchDemo }
export type { MainnetLaunchCtx }

/** Lazy-load Pump SDK mainnet path so demo stays lighter. */
export async function launchMainnet(
  draft: LaunchDraft,
  ctx: MainnetLaunchCtx,
): Promise<LaunchResult> {
  const mod = await import('./pump/launch')
  return mod.launchMainnet(draft, ctx)
}
