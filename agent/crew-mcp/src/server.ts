import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import * as z from 'zod/v4'
import { asText, crewFetch, loadConfig, DEFAULT_API_URL, DEFAULT_SITE_URL } from './client.js'

/** Build the CREW MCP server — tools for crypto agents launching on Solana / Pump.fun. */
export function createCrewMcpServer() {
  const cfg = loadConfig()
  const server = new McpServer({
    name: 'crewpay',
    version: '1.0.0',
    websiteUrl: DEFAULT_SITE_URL,
  })

  server.registerResource(
    'crew-discovery',
    `${cfg.apiUrl}/api/agent`,
    {
      description:
        'CREW / CrewPay agent discovery JSON — Solana Pump.fun launches with KOL fee-shares for crypto AI agents.',
      mimeType: 'application/json',
    },
    async () => {
      const data = await crewFetch(cfg, '/api/agent')
      return {
        contents: [
          {
            uri: `${cfg.apiUrl}/api/agent`,
            mimeType: 'application/json',
            text: JSON.stringify(data, null, 2),
          },
        ],
      }
    },
  )

  server.registerResource(
    'crew-llms',
    `${cfg.apiUrl}/llms.txt`,
    {
      description: 'llmstxt.org index for CREW Agent API (crypto / Solana / Pump.fun).',
      mimeType: 'text/plain',
    },
    async () => {
      const res = await fetch(`${cfg.apiUrl}/llms.txt`)
      const text = await res.text()
      return {
        contents: [
          {
            uri: `${cfg.apiUrl}/llms.txt`,
            mimeType: 'text/plain',
            text,
          },
        ],
      }
    },
  )

  server.registerTool(
    'crew_discover',
    {
      title: 'Discover CREW Agent API',
      description:
        'Load CREW / CrewPay discovery for crypto agents: Autohire KOLs, launch Pump.fun coins, fee-shares, OpenAPI links. Use this first when working on Solana meme coins, KOLs, or CrewPay.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () => {
      const data = await crewFetch(cfg, '/api/agent')
      return asText({
        site: DEFAULT_SITE_URL,
        api: cfg.apiUrl,
        docs: `${DEFAULT_SITE_URL}/agents`,
        llms: `${cfg.apiUrl}/llms.txt`,
        discovery: data,
        tip: 'Next: crew_autohire to preview KOL pack, then crew_launch with imageUrl + autoHire.',
      })
    },
  )

  server.registerTool(
    'crew_search_kols',
    {
      title: 'Search CREW KOL directory',
      description:
        'Search the CREW KOL / Pump profile directory by handle or wallet. Use when a crypto agent wants to evaluate specific KOLs beyond Autohire.',
      inputSchema: {
        q: z.string().min(1).max(64).describe('Handle, pump username, or wallet substring'),
        limit: z.number().int().min(1).max(50).optional().describe('Max results (default 20)'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ q, limit }) => {
      const qs = new URLSearchParams({ q, limit: String(limit ?? 20) })
      const data = await crewFetch(cfg, `/api/kols?${qs}`)
      return asText(data)
    },
  )

  server.registerTool(
    'crew_autohire',
    {
      title: 'Narrative Autohire KOLs',
      description:
        'Preview CREW narrative Autohire: match a Solana / Pump.fun token name, ticker, and vibe to the top KOL pack (wallets, roles, shares, reasons). No on-chain tx. Requires CREW_AGENT_API_KEY.',
      inputSchema: {
        name: z.string().max(32).optional().describe('Token name'),
        ticker: z.string().max(13).optional().describe('Token ticker'),
        description: z
          .string()
          .max(240)
          .optional()
          .describe('Narrative / vibe — drives KOL matching (ai, animal, trench, meme, …)'),
        seats: z.number().int().min(1).max(10).optional().describe('Crew seats 1–10 (default 5)'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (input) => {
      const data = await crewFetch(cfg, '/api/agent/autohire', {
        method: 'POST',
        auth: true,
        body: JSON.stringify({
          name: input.name || '',
          ticker: input.ticker || '',
          description: input.description || '',
          seats: input.seats ?? 5,
        }),
      })
      return asText(data)
    },
  )

  server.registerTool(
    'crew_launch',
    {
      title: 'Launch Pump coin via CrewPay',
      description:
        'Launch a Solana Pump.fun coin with CREW fee-shares (25% CREW buyback + hired KOLs). Prefer autoHire for narrative matching, or pass crew[] to override. Requires CREW_AGENT_API_KEY + CREW_LAUNCHER_KEY. Always check feeShareLocked on the result.',
      inputSchema: {
        name: z.string().min(2).max(32),
        ticker: z.string().min(2).max(13),
        description: z.string().max(240).optional(),
        imageUrl: z.string().url().optional().describe('Public image URL (or use imageBase64)'),
        imageBase64: z.string().min(64).optional(),
        seats: z.number().int().min(1).max(10).optional().describe('Autohire seats when crew omitted'),
        mode: z.enum(['agent', 'split', 'buyback', 'raid']).optional(),
        initialBuySol: z.number().min(0).max(10).optional(),
        agentName: z.string().min(2).max(48).optional(),
        agentObjective: z.string().min(8).max(280).optional(),
        agentModel: z.string().max(48).optional().describe('e.g. claude, gpt, gemini, grok'),
        idempotencyKey: z
          .string()
          .min(8)
          .max(128)
          .optional()
          .describe('Retry-safe key; replays cached launch for 15m'),
        launcherKey: z
          .string()
          .min(32)
          .optional()
          .describe(
            'Agent Solana secret for this launch (base58 or JSON bytes). Overrides CREW_LAUNCHER_KEY env. Never log it.',
          ),
        crew: z
          .array(
            z.object({
              handle: z.string(),
              wallet: z.string(),
              share: z.number().int().min(1).max(100),
              hireRole: z.enum(['caller', 'chart', 'raid', 'kol', 'dev']).optional(),
            }),
          )
          .min(1)
          .max(10)
          .optional()
          .describe('Explicit crew overrides Autohire when provided'),
      },
      annotations: { readOnlyHint: false, openWorldHint: true, destructiveHint: true },
    },
    async (input) => {
      if (!input.imageUrl && !input.imageBase64) {
        throw new Error('Provide imageUrl or imageBase64')
      }
      const body: Record<string, unknown> = {
        name: input.name,
        ticker: input.ticker,
        description: input.description || '',
        mode: input.mode || 'agent',
        initialBuySol: input.initialBuySol ?? 0,
        agent: {
          name: input.agentName || 'Crew MCP Agent',
          objective:
            input.agentObjective ||
            input.description ||
            'Hire KOLs and grow the coin on CREW.',
          model: input.agentModel || 'mcp',
        },
      }
      if (input.imageUrl) body.imageUrl = input.imageUrl
      if (input.imageBase64) body.imageBase64 = input.imageBase64
      if (input.crew?.length) body.crew = input.crew
      else body.autoHire = { seats: input.seats ?? 5 }

      const data = await crewFetch(cfg, '/api/agent/launch', {
        method: 'POST',
        auth: true,
        launcher: true,
        launcherKeyOverride: input.launcherKey,
        idempotencyKey: input.idempotencyKey,
        body: JSON.stringify(body),
      })
      return asText(data)
    },
  )

  server.registerPrompt(
    'crew-crypto-launch',
    {
      description:
        'Prompt template for crypto AI agents launching a Pump.fun coin on CREW with narrative Autohire.',
      argsSchema: {
        idea: z.string().describe('Token idea / narrative'),
        ticker: z.string().optional().describe('Optional ticker'),
      },
    },
    ({ idea, ticker }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              'You are a crypto launch agent using CREW / CrewPay MCP tools.',
              'Flow: crew_discover → crew_autohire → (optional crew_search_kols / remix) → crew_launch.',
              'Prefer autoHire unless the user named specific wallets. Always check feeShareLocked.',
              `Idea: ${idea}`,
              ticker ? `Ticker hint: ${ticker}` : '',
              `Docs: ${DEFAULT_SITE_URL}/agents · ${DEFAULT_API_URL}/llms.txt`,
            ]
              .filter(Boolean)
              .join('\n'),
          },
        },
      ],
    }),
  )

  return server
}
