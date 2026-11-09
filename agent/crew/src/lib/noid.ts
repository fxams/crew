/** Public NOID Agent Kit constants for crewpay.dev. No secrets. Independent tooling. */

export const NOID_KIT_SITE = 'https://noid-agent-kit.onrender.com'
export const NOID_KIT_HTTP = `${NOID_KIT_SITE}/mcp`
export const NOID_KIT_CARD = `${NOID_KIT_SITE}/.well-known/mcp/server-card.json`
export const NOID_KIT_HEALTH = `${NOID_KIT_SITE}/health`
export const NOID_KIT_REST = `${NOID_KIT_SITE}/api/v1`

/** Live tools/list (2026-11-09) from the kit server card + MCP catalog. */
export const NOID_KIT_TOOLS = [
  'create_invoice',
  'check_invoice',
  'list_invoices',
  'verify_receipt',
  'get_quote',
  'get_whale_moves',
  'get_new_tokens',
  'get_mempool_highlights',
  'get_hashrate_shift',
  'upsert_watchlist',
  'list_watchlists',
  'create_launch_kit',
  'list_pricing',
  'get_balance',
  'get_payment_info',
  'claim_payment',
] as const

export const NOID_PUBLIC_NOTE =
  'Independent remote MCP for Parano1d (NOID): checkout invoices and receipt verification, whale and new-token alerts, and a native-asset launch checklist. Not affiliated with, partnered with, or audited by Parano1d. 50-credit trial. Top-ups in USDC on Base. CrewPay never takes custody. No earnings promises.'

export const NOID_KIT_CONNECT = `{
  "mcpServers": {
    "noid-agent-kit": {
      "url": "${NOID_KIT_HTTP}",
      "headers": {
        "Authorization": "Bearer nak_YOUR_KEY"
      }
    }
  }
}`
