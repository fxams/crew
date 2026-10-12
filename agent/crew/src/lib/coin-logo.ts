import { CREW_AGENT_API_URL } from './config'

/** Cached logo proxy — browsers never hit ipfs.io / dweb.link directly. */
export function coinLogoSrc(mint: string): string {
  return `${CREW_AGENT_API_URL}/api/coins/${encodeURIComponent(mint.trim())}/logo`
}
