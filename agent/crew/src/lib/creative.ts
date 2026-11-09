/** Public Creative / creative-mcp constants for crewpay.dev. No secrets. */

export const CREATIVE_MCP_SITE = 'https://creative-mcp-40dj.onrender.com'
export const CREATIVE_MCP_HTTP = `${CREATIVE_MCP_SITE}/mcp`
export const CREATIVE_MCP_CARD = `${CREATIVE_MCP_SITE}/.well-known/mcp/server-card.json`

export const CREATIVE_MCP_TOOLS = [
  'generate_image',
  'generate_logo_kit',
  'generate_banner',
  'generate_sticker_pack',
  'generate_teaser_video',
  'generate_music_bed',
  'generate_launch_kit',
  'get_job',
  'get_balance',
  'list_pricing',
  'get_payment_info',
  'claim_payment',
] as const

export const CREATIVE_STILL_KINDS = ['logo', 'banner', 'meme'] as const

export const CREATIVE_PUBLIC_NOTE =
  'Logos, memes, banners, sticker packs, music, and short teaser videos for launches. 50-credit trial. Top-ups in USDC on Base. Humans stay the core. No earnings promises.'

export const CREATIVE_MCP_CONNECT = `{
  "mcpServers": {
    "launchkit-mcp": {
      "url": "${CREATIVE_MCP_HTTP}",
      "headers": {
        "Authorization": "Bearer lk_YOUR_KEY"
      }
    }
  }
}`
