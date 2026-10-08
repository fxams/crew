#!/usr/bin/env node
/**
 * Re-announce CrewPay discovery surfaces to WellKnown (and print checklist).
 * Safe to re-run — duplicates attach to existing records.
 */
const SITE = 'https://crewpay.dev'
const API = 'https://api.crewpay.dev'
const MCP = 'https://mcp.crewpay.dev/mcp'

async function submit(body) {
  const res = await fetch('https://wellknown.network/api/v1/submit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  console.log(res.status, JSON.stringify(json, null, 2))
  return json
}

console.log('→ WellKnown site agent card')
await submit({ cardUrl: `${SITE}/.well-known/agent.json` })

console.log('→ WellKnown API agent card')
await submit({ cardUrl: `${API}/.well-known/agent.json` })

console.log('→ WellKnown MCP manifest')
await submit({
  manifest: {
    name: 'crewpay',
    kind: 'mcp_server',
    summary:
      'CREW / CrewPay — Solana Pump.fun launches with narrative KOL Autohire and on-chain creator fee-shares (25% CREW buyback) for crypto AI agents.',
    repository: 'https://github.com/fxams/crew',
    homepage: `${SITE}/agents`,
    protocols: ['mcp', 'http'],
    endpoints: [
      { url: MCP, type: 'mcp_streamable_http', auth: 'api_key' },
      { url: `${API}/api/agent`, type: 'openapi', auth: 'api_key' },
    ],
    tags: ['solana', 'pump.fun', 'crypto', 'meme-coin', 'kol', 'crewpay', 'mcp', 'fee-share'],
    skills: [
      { name: 'crew_autohire', description: 'Narrative KOL Autohire' },
      { name: 'crew_launch_dry_run', description: 'Validate launch without spending SOL' },
      { name: 'crew_launch', description: 'Mainnet Pump create + CREW fee-shares' },
    ],
  },
})

console.log(`
Checklist (manual):
- Claim https://wellknown.network/agents/crewpay/claim
- Claim https://wellknown.network/agents/crew-agent-launch/claim
- GitHub topics: see DISCOVERY.md
- Smithery: https://smithery.ai/new → ${MCP}
- Glama: claim after GitHub index
- Solana: docs/register-solana-agent.md
- CT: docs/ct-announce.md
`)
