import type { LaunchDraft, LaunchResult } from './types'
import type { MainnetLaunchCtx } from './pump/launch'

export type { MainnetLaunchCtx }

/** Lazy-load Pump SDK launch path. */
export async function launchCrew(
  draft: LaunchDraft,
  ctx: MainnetLaunchCtx,
): Promise<LaunchResult> {
  const mod = await import('./pump/launch')
  return mod.launchMainnet(draft, ctx)
}
