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

/** Alias — some clients probe /api/agent.json */
discoveryRouter.get('/api/agent.json', (_req, res) => jsonDoc(res, agentDiscoveryJson()))

discoveryRouter.get('/mcp.json', (_req, res) =>
  jsonDoc(res, {
    name: 'crewpay',
    description:
      'CREW / CrewPay — Solana Pump.fun launches with narrative KOL Autohire and on-chain fee-shares for crypto AI agents.',
    homepage: `${SITE_URL}/agents`,
    llms: `${SITE_URL}/llms.txt`,
    api: API_URL,
    openapi: `${API_URL}/openapi.json`,
    proof: `${SITE_URL}/proof`,
    aliases: {
      api: ['https://crewpay-api.onrender.com'],
      mcp_http: ['https://crewpay-mcp.onrender.com/mcp'],
    },
    mcp: {
      stdio: {
        package: 'agent/crew-mcp',
        command: 'node',
        args: ['agent/crew-mcp/dist/index.js'],
        env: ['CREW_AGENT_API_KEY', 'CREW_LAUNCHER_KEY', 'CREW_API_URL'],
      },
      http: { url: MCP_HTTP_URL, transport: 'streamable-http' },
      http_legacy: 'https://crewpay-mcp.onrender.com/mcp',
    },
    tools: [
      'crew_discover',
      'crew_search_kols',
      'crew_autohire',
      'crew_launch',
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
      'buyback',
    ],
    manifest: MCP_MANIFEST_URL,
  }),
)
