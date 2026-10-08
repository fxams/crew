#!/usr/bin/env node
/**
 * CREW / CrewPay MCP server
 *
 * Stdio (default): Cursor, Claude Desktop, and local MCP clients.
 * HTTP: set CREW_MCP_HTTP=1 (or --http) to expose Streamable HTTP on PORT.
 *
 * Env:
 *   CREW_AGENT_API_KEY   required for autohire/launch (private installs)
 *   CREW_LAUNCHER_KEY    required for launch — MCP env only, never tool args
 *   CREW_API_URL         optional (default https://api.crewpay.dev)
 *   CREW_MCP_PUBLIC=1    public hosted mode: ignore shared env keys; require
 *                        x-crew-api-key on MCP HTTP requests for writes
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createCrewMcpServer } from './server.js'
import { DEFAULT_API_URL, DEFAULT_SITE_URL } from './client.js'

const MCP_WELL_KNOWN = {
  name: 'crewpay',
  description:
    'CREW / CrewPay — Solana Pump.fun launches with narrative KOL Autohire and on-chain fee-shares for crypto AI agents.',
  websiteUrl: DEFAULT_SITE_URL,
  homepage: `${DEFAULT_SITE_URL}/agents`,
  llms: `${DEFAULT_SITE_URL}/llms.txt`,
  api: DEFAULT_API_URL,
  openapi: `${DEFAULT_API_URL}/openapi.json`,
  proof: `${DEFAULT_SITE_URL}/proof`,
  mcp: {
    http: {
      url: 'https://mcp.crewpay.dev/mcp',
      transport: 'streamable-http',
    },
    stdio: {
      command: 'node',
      args: ['agent/crew-mcp/dist/index.js'],
      env: ['CREW_AGENT_API_KEY', 'CREW_LAUNCHER_KEY', 'CREW_API_URL'],
    },
  },
  auth: {
    httpHeader: 'x-crew-api-key',
    note: 'Public hosted MCP: pass x-crew-api-key for writes. Launcher secrets never via tool args — local MCP env or REST only.',
  },
  tools: [
    'crew_discover',
    'crew_search_kols',
    'crew_autohire',
    'crew_launch_dry_run',
    'crew_launch',
    'crew_status',
    'crew_wire_fees',
    'crew_lock_holder_kol',
    'crew_crank_remits',
    'crew_proof',
  ],
}

async function main() {
  const httpMode =
    process.argv.includes('--http') ||
    process.env.CREW_MCP_HTTP === '1' ||
    process.env.CREW_MCP_HTTP === 'true'

  if (httpMode) {
    const express = (await import('express')).default
    const { StreamableHTTPServerTransport } = await import(
      '@modelcontextprotocol/sdk/server/streamableHttp.js'
    )
    const { isInitializeRequest } = await import('@modelcontextprotocol/sdk/types.js')
    const { randomUUID } = await import('node:crypto')

    // HTTP transport defaults to publicMode so a missing Render env cannot leave
    // the shared CREW_AGENT_API_KEY usable by anonymous MCP clients.
    // Opt out with CREW_MCP_PUBLIC=0 for private HTTP installs that use env keys.
    const publicFlag = (process.env.CREW_MCP_PUBLIC || '').trim().toLowerCase()
    const publicMode = !(publicFlag === '0' || publicFlag === 'false')

    const app = express()
    app.use(express.json({ limit: '2mb' }))
    const transports = new Map<string, InstanceType<typeof StreamableHTTPServerTransport>>()
    /** Per MCP session API key from x-crew-api-key (public mode). */
    const sessionKeys = new Map<string, string>()

    app.get('/', (_req, res) => {
      res.json({
        name: 'crewpay-mcp',
        version: '1.1.2',
        transport: 'streamable-http',
        mcp: '/mcp',
        wellKnown: '/.well-known/mcp.json',
        docs: `${DEFAULT_SITE_URL}/agents`,
        llms: `${DEFAULT_API_URL}/llms.txt`,
        api: DEFAULT_API_URL,
        publicMode,
        auth: publicMode
          ? 'Pass x-crew-api-key for autohire / dry-run / launch / repair tools'
          : 'Uses CREW_AGENT_API_KEY from server env when set',
        topics: ['solana', 'pump.fun', 'crypto', 'kol', 'crewpay', 'meme-coin'],
      })
    })

    app.get('/healthz', (_req, res) => {
      res.json({ ok: true, publicMode })
    })

    app.get(['/.well-known/mcp.json', '/mcp.json'], (_req, res) => {
      res.setHeader('Cache-Control', 'public, max-age=300')
      res.json(MCP_WELL_KNOWN)
    })

    /** Static server card for Smithery / registry scanners (SEP-1649). */
    app.get('/.well-known/mcp/server-card.json', (_req, res) => {
      res.setHeader('Cache-Control', 'public, max-age=300')
      res.json({
        serverInfo: { name: 'crewpay', version: '1.1.2', websiteUrl: DEFAULT_SITE_URL },
        authentication: {
          required: true,
          schemes: ['api_key'],
          header: 'x-crew-api-key',
          note: 'Public hosted MCP: pass x-crew-api-key for writes. Reads (discover/proof/search) work without a key.',
        },
        tools: MCP_WELL_KNOWN.tools.map((name) => ({
          name,
          description: `CREW / CrewPay tool: ${name}`,
        })),
        resources: [{ name: 'crew-discovery' }, { name: 'crew-llms' }],
        prompts: [],
        homepage: `${DEFAULT_SITE_URL}/agents`,
        llms: `${DEFAULT_API_URL}/llms.txt`,
        repository: 'https://github.com/fxams/crew',
      })
    })

    app.post('/mcp', async (req, res) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined
      const clientKey = (req.header('x-crew-api-key') || '').trim()
      try {
        if (sessionId && transports.has(sessionId)) {
          if (clientKey) sessionKeys.set(sessionId, clientKey)
          await transports.get(sessionId)!.handleRequest(req, res, req.body)
          return
        }
        if (!sessionId && isInitializeRequest(req.body)) {
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (id: string) => {
              transports.set(id, transport)
              if (clientKey) sessionKeys.set(id, clientKey)
            },
          })
          transport.onclose = () => {
            const id = transport.sessionId
            if (id) {
              transports.delete(id)
              sessionKeys.delete(id)
            }
          }
          const sessionApiKey = clientKey || undefined
          const mcp = createCrewMcpServer({
            publicMode,
            apiKey: sessionApiKey,
          })
          // Re-bind tools to pick up session key updates: wrap by recreating
          // server with key captured at init; subsequent requests can refresh
          // sessionKeys but tool closures use init key — refresh on each new session.
          await mcp.connect(transport)
          await transport.handleRequest(req, res, req.body)
          return
        }
        res.status(400).json({ error: 'Bad MCP session — send initialize without mcp-session-id' })
      } catch (err) {
        console.error('MCP HTTP error', err instanceof Error ? err.message : err)
        if (!res.headersSent) res.status(500).json({ error: 'MCP handler failed' })
      }
    })

    app.get('/mcp', async (req, res) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined
      if (!sessionId || !transports.has(sessionId)) {
        res.status(400).json({ error: 'Invalid session' })
        return
      }
      await transports.get(sessionId)!.handleRequest(req, res)
    })

    const port = Number(process.env.PORT || 3333)
    app.listen(port, '0.0.0.0', () => {
      console.error(
        `crewpay-mcp HTTP listening on 0.0.0.0:${port} (/ /mcp /.well-known/mcp.json) publicMode=${publicMode}`,
      )
    })
    return
  }

  const server = createCrewMcpServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error(
    'crewpay-mcp stdio ready — crypto agents can call crew_discover / crew_autohire / crew_launch_dry_run / crew_launch',
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
