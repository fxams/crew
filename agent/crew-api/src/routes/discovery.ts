import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Router } from 'express'
import {
  agentCard,
  agentDiscoveryJson,
  aiPluginManifest,
  API_URL,
  llmsFullTxt,
  llmsTxt,
  MCP_HTTP_URL,
  MCP_MANIFEST_URL,
  openApiSpec,
  robotsTxt,
  SITE_URL,
} from '../lib/agent/discovery.js'

export const discoveryRouter = Router()

/** Prefer cwd (Render rootDir / local) then dist-adjacent fallbacks. */
function readWellknownVerify(): string | null {
  const candidates = [
    resolve(process.cwd(), 'data/wellknown-verify.txt'),
    resolve(dirname(fileURLToPath(import.meta.url)), '../../data/wellknown-verify.txt'),
    resolve(dirname(fileURLToPath(import.meta.url)), '../../../data/wellknown-verify.txt'),
  ]
  for (const path of candidates) {
    try {
      return readFileSync(path, 'utf8')
    } catch {
      /* try next */
    }
  }
  return null
}

function textPlain(res: import('express').Response, body: string) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=300')
  res.send(body)
}

function jsonDoc(res: import('express').Response, body: unknown) {
  res.setHeader('Cache-Control', 'public, max-age=300')
  res.json(body)
}

discoveryRouter.get('/llms.txt', (_req, res) => textPlain(res, llmsTxt()))
discoveryRouter.get('/llms-full.txt', (_req, res) => textPlain(res, llmsFullTxt()))
discoveryRouter.get('/robots.txt', (_req, res) => textPlain(res, robotsTxt()))
discoveryRouter.get('/openapi.json', (_req, res) => jsonDoc(res, openApiSpec()))
discoveryRouter.get('/api/openapi.json', (_req, res) => jsonDoc(res, openApiSpec()))

discoveryRouter.get('/.well-known/llms.txt', (_req, res) => textPlain(res, llmsTxt()))
discoveryRouter.get('/.well-known/agent.json', (_req, res) =>
  jsonDoc(res, agentCard('api')),
)
discoveryRouter.get('/.well-known/ai-plugin.json', (_req, res) =>
  jsonDoc(res, aiPluginManifest()),
)
/** WellKnown ownership proof — https://wellknown.network/docs/claim */
discoveryRouter.get('/.well-known/wellknown-verify.txt', (_req, res) => {
  const body = readWellknownVerify()
  if (!body) {
    res.status(404).type('text').send('not found\n')
    return
  }
  textPlain(res, body.endsWith('\n') ? body : `${body}\n`)
})

/** Alias — some clients probe /api/agent.json */
discoveryRouter.get('/api/agent.json', (_req, res) => jsonDoc(res, agentDiscoveryJson()))

discoveryRouter.get('/mcp.json', (_req, res) =>
  jsonDoc(res, {
    name: 'crewpay',
    description:
      'CREW / CrewPay — Solana Pump.fun launches with KOL Autohire and on-chain fee-shares (60/15/25). Buyback cron not live yet. Always dry-run first.',
    homepage: `${SITE_URL}/agents`,
    llms: `${SITE_URL}/llms.txt`,
    api: API_URL,
    openapi: `${API_URL}/openapi.json`,
    proof: `${SITE_URL}/proof`,
    clawhub: 'https://clawhub.ai/fxams/crewpay',
    aliases: {
      api: ['https://crewpay-api.onrender.com'],
      mcp_http: ['https://crewpay-mcp.onrender.com/mcp'],
    },
    mcp: {
      stdio: {
        package: 'crewpay-mcp@1.2.0',
        command: 'npx',
        args: ['-y', 'crewpay-mcp@1.2.0'],
        env: ['CREW_AGENT_API_KEY', 'CREW_LAUNCHER_KEY', 'CREW_API_URL'],
      },
      http: { url: MCP_HTTP_URL, transport: 'streamable-http' },
      http_legacy: 'https://crewpay-mcp.onrender.com/mcp',
    },
    tools: [
      'crew_discover',
      'crew_claim_key',
      'crew_search_kols',
      'crew_autohire',
      'crew_launch_dry_run',
      'crew_launch',
      'crew_list_launches',
      'crew_status',
      'crew_wire_fees',
      'crew_lock_holder_kol',
      'crew_crank_remits',
      'crew_proof',
    ],
    tags: [
      'solana',
      'pump.fun',
      'crypto',
      'meme-coin',
      'kol',
      'crewpay',
      'agent',
      'fee-share',
    ],
    manifest: MCP_MANIFEST_URL,
  }),
)
