#!/usr/bin/env node
/**
 * Reference crypto agent — discover → autohire → (optional) launch.
 *
 * Env:
 *   CREW_API_URL           default https://crewpay-api.onrender.com
 *   CREW_AGENT_API_KEY     required for autohire/launch
 *   CREW_LAUNCHER_KEY      required only when --launch
 *   CREW_IMAGE_URL         public image for --launch
 *
 * Usage:
 *   node scripts/reference-agent.mjs "desk cat meme" --ticker DCAT
 *   node scripts/reference-agent.mjs "desk cat" --launch
 */

const API = (process.env.CREW_API_URL || 'https://crewpay-api.onrender.com').replace(/\/$/, '')
const KEY = process.env.CREW_AGENT_API_KEY || ''
const LAUNCHER = process.env.CREW_LAUNCHER_KEY || ''

const args = process.argv.slice(2)
const doLaunch = args.includes('--launch')
const tickerFlag = args.indexOf('--ticker')
const ticker = tickerFlag >= 0 ? args[tickerFlag + 1] : 'CREWBOT'
const idea = args.filter((a, i) => !a.startsWith('--') && i !== tickerFlag + 1).join(' ') || 'crew reference agent'

async function main() {
  console.log('[ref-agent] discovery')
  const discovery = await fetch(`${API}/api/agent`).then((r) => r.json())
  console.log('[ref-agent] service', discovery.name, 'mcp tools', discovery.mcp?.tools?.join(', '))

  console.log('[ref-agent] proof')
  const proof = await fetch(`${API}/api/proof?limit=5`).then((r) => r.json())
  console.log('[ref-agent] buyback ok runs', proof.stats?.buybackOkRuns, 'remit SOL', proof.stats?.remitSolTotal)

  if (!KEY) {
    console.log('[ref-agent] set CREW_AGENT_API_KEY to Autohire / launch')
    return
  }

  console.log('[ref-agent] autohire', { idea, ticker })
  const autohire = await fetch(`${API}/api/agent/autohire`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-crew-api-key': KEY,
    },
    body: JSON.stringify({ name: idea.slice(0, 32), ticker, description: idea, seats: 5 }),
  }).then(async (r) => ({ status: r.status, body: await r.json() }))
  console.log('[ref-agent] autohire', autohire.status, autohire.body.hires?.map((h) => h.handle).join(', '))

  if (!doLaunch) {
    console.log('[ref-agent] dry run complete — pass --launch + CREW_LAUNCHER_KEY + CREW_IMAGE_URL to mint')
    return
  }

  const imageUrl = process.env.CREW_IMAGE_URL
  if (!LAUNCHER || !imageUrl) {
    throw new Error('Need CREW_LAUNCHER_KEY and CREW_IMAGE_URL for --launch')
  }

  const launch = await fetch(`${API}/api/agent/launch`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-crew-api-key': KEY,
      'x-launcher-key': LAUNCHER,
      'x-idempotency-key': `ref-${Date.now()}`,
    },
    body: JSON.stringify({
      name: idea.slice(0, 32),
      ticker,
      description: idea.slice(0, 240),
      mode: 'agent',
      imageUrl,
      autoHire: { seats: 5 },
      agent: { name: 'ReferenceAgent', objective: idea.slice(0, 280), model: 'reference' },
    }),
  }).then(async (r) => ({ status: r.status, body: await r.json() }))

  console.log('[ref-agent] launch', launch.status, {
    mint: launch.body.mint,
    feeShareLocked: launch.body.feeShareLocked,
    pumpUrl: launch.body.pumpUrl,
    warning: launch.body.warning,
  })

  if (launch.body.mint && !launch.body.feeShareLocked) {
    console.log('[ref-agent] tip: call POST /api/agent/wire-fees or crew_wire_fees MCP tool')
  }
}

main().catch((err) => {
  console.error('[ref-agent] failed', err)
  process.exit(1)
})
