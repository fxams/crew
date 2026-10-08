#!/usr/bin/env node
/**
 * CREW / CrewPay MCP server
 *
 * Stdio (default): Cursor, Claude Desktop, and local MCP clients.
 * HTTP: set CREW_MCP_HTTP=1 (or --http) to expose Streamable HTTP on PORT (default 3333).
 *
 * Env:
 *   CREW_AGENT_API_KEY   required for autohire/launch
 *   CREW_LAUNCHER_KEY    required for launch (Solana secret)
 *   CREW_API_URL         optional (default https://crewpay-api.onrender.com)
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createCrewMcpServer } from './server.js'

async function main() {
  const httpMode =
    process.argv.includes('--http') ||
    process.env.CREW_MCP_HTTP === '1' ||
    process.env.CREW_MCP_HTTP === 'true'

  const server = createCrewMcpServer()

  if (httpMode) {
    const { createMcpExpressApp } = await import('@modelcontextprotocol/sdk/server/express.js')
    const { StreamableHTTPServerTransport } = await import(
      '@modelcontextprotocol/sdk/server/streamableHttp.js'
    )
    const { isInitializeRequest } = await import('@modelcontextprotocol/sdk/types.js')
    const { randomUUID } = await import('node:crypto')
    type Req = import('express').Request
    type Res = import('express').Response

    const app = createMcpExpressApp()
    const transports = new Map<string, InstanceType<typeof StreamableHTTPServerTransport>>()

    app.post('/mcp', async (req: Req, res: Res) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined
      try {
        if (sessionId && transports.has(sessionId)) {
          const transport = transports.get(sessionId)!
          await transport.handleRequest(req, res, req.body)
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
        res.status(400).json({ error: 'Bad MCP session' })
      } catch (err) {
        console.error('MCP HTTP error', err instanceof Error ? err.message : err)
        if (!res.headersSent) res.status(500).json({ error: 'MCP handler failed' })
      }
    })

    app.get('/mcp', async (req: Req, res: Res) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined
      if (!sessionId || !transports.has(sessionId)) {
        res.status(400).json({ error: 'Invalid session' })
        return
      }
      await transports.get(sessionId)!.handleRequest(req, res)
    })

    app.get('/', (_req: Req, res: Res) => {
      res.json({
        name: 'crewpay-mcp',
        transport: 'streamable-http',
        mcp: '/mcp',
        docs: 'https://crewpay.dev/agents',
        llms: 'https://crewpay-api.onrender.com/llms.txt',
        topics: ['solana', 'pump.fun', 'crypto', 'kol', 'crewpay', 'meme-coin'],
      })
    })

    const port = Number(process.env.PORT || 3333)
    app.listen(port, () => {
      console.error(`crewpay-mcp HTTP on :${port}/mcp`)
    })
    return
  }

  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('crewpay-mcp stdio ready — crypto agents can call crew_discover / crew_autohire / crew_launch')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
