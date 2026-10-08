#!/usr/bin/env node
/**
 * CREW / CrewPay MCP server
 *
 * Stdio (default): Cursor, Claude Desktop, and local MCP clients.
 * HTTP: set CREW_MCP_HTTP=1 (or --http) to expose Streamable HTTP on PORT.
 *
 * Env:
 *   CREW_AGENT_API_KEY   required for autohire/launch
 *   CREW_LAUNCHER_KEY    required for launch (Solana secret) — or pass per tool call
 *   CREW_API_URL         optional (default https://crewpay-api.onrender.com)
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createCrewMcpServer } from './server.js'

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

    const app = express()
    app.use(express.json({ limit: '2mb' }))
    const transports = new Map<string, InstanceType<typeof StreamableHTTPServerTransport>>()

    app.get('/', (_req, res) => {
      res.json({
        name: 'crewpay-mcp',
        transport: 'streamable-http',
        mcp: '/mcp',
        docs: 'https://crewpay.dev/agents',
        llms: 'https://crewpay-api.onrender.com/llms.txt',
        topics: ['solana', 'pump.fun', 'crypto', 'kol', 'crewpay', 'meme-coin'],
      })
    })

    app.get('/healthz', (_req, res) => {
      res.json({ ok: true })
    })

    app.post('/mcp', async (req, res) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined
      try {
        if (sessionId && transports.has(sessionId)) {
          await transports.get(sessionId)!.handleRequest(req, res, req.body)
          return
        }
        if (!sessionId && isInitializeRequest(req.body)) {
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (id: string) => {
              transports.set(id, transport)
            },
          })
          transport.onclose = () => {
            const id = transport.sessionId
            if (id) transports.delete(id)
          }
          const mcp = createCrewMcpServer()
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
      console.error(`crewpay-mcp HTTP listening on 0.0.0.0:${port} (/ and /mcp)`)
    })
    return
  }

  const server = createCrewMcpServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error(
    'crewpay-mcp stdio ready — crypto agents can call crew_discover / crew_autohire / crew_launch',
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
