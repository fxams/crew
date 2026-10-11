import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import * as z from 'zod/v4'
import {
  asText,
  crewFetch,
  loadConfig,
  DEFAULT_API_URL,
  DEFAULT_SITE_URL,
  type CrewApiConfig,
} from './client.js'
import { assertNoSecretToolArgs } from './secrets.js'

function packageVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    const pkg = JSON.parse(readFileSync(join(here, '../package.json'), 'utf8')) as { version?: string }
    return pkg.version || '0.0.0'
  } catch {
    return '0.0.0'
  }
}

const mintSchema = z
  .string()
  .min(32)
  .max(64)
  .regex(/^[1-9A-HJ-NP-Za-km-z]{32,64}$/, 'Invalid Solana mint address')

const crewMemberSchema = z.object({
  handle: z.string(),
  wallet: z.string().min(32).max(64),
  share: z.number().int().min(1).max(100),
  hireRole: z.enum(['caller', 'chart', 'raid', 'kol', 'dev']).optional(),
})

/** Declared so Zod does not strip them — handlers hard-reject if present. */
const forbiddenSecretFields = {
  launcherKey: z
    .string()
    .optional()
    .describe('FORBIDDEN — rejected if set. Use CREW_LAUNCHER_KEY in MCP env only.'),
  privateKey: z.string().optional().describe('FORBIDDEN — rejected if set.'),
  secretKey: z.string().optional().describe('FORBIDDEN — rejected if set.'),
}

/** Build the CREW MCP server — tools for crypto agents launching on Solana / Pump.fun. */
export function createCrewMcpServer(overrides?: Partial<CrewApiConfig>) {
  const cfg = loadConfig(overrides)
  const server = new McpServer({
    name: 'crewpay',
    version: packageVersion(),
    websiteUrl: DEFAULT_SITE_URL,
  })

  server.registerResource(
    'crew-discovery',
    `${cfg.apiUrl}/api/agent`,
    {
      description:
        'CREW / CrewPay agent discovery JSON — Solana Pump.fun launches with KOL fee-shares for crypto AI agents.',
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
        tip: 'Safe flow: crew_claim_key (if needed) → crew_discover → crew_autohire → crew_launch_dry_run → operator opens approvalUrl + wallet-signs → crew_launch(dryRunId). Wire-fees needs its own dry-run intent=wire-fees. Secrets stay in MCP env only.',
        auth: {
          reads: 'crew_discover / crew_search_kols / crew_proof / crew_claim_key need no API key',
          writes: cfg.publicMode
            ? 'Pass x-crew-api-key on the MCP HTTP request (or run locally with CREW_AGENT_API_KEY). Mint via crew_claim_key or POST /api/agent/keys/claim.'
            : 'Set CREW_AGENT_API_KEY in MCP env (mint via crew_claim_key). Operator mint: POST /api/agent/keys.',
          launcher: cfg.publicMode
            ? 'Public hosted MCP cannot launch with your wallet — run crewpay-mcp locally with CREW_LAUNCHER_KEY, or use REST x-launcher-key from your backend.'
            : 'Set CREW_LAUNCHER_KEY in MCP env — never pass Solana secrets as tool arguments.',
        },
        publicMode: Boolean(cfg.publicMode),
      })
    },
  )

  server.registerTool(
    'crew_claim_key',
    {
      title: 'Claim a self-serve CREW API key',
      description:
        'Mint a crew_ak_… agent API key with no operator signup (POST /api/agent/keys/claim). Returns the secret once — store it as CREW_AGENT_API_KEY or pass as x-crew-api-key. Rate-limited 5/hour/IP. Default 5 launches/hour. Use before autohire/launch when you have no key.',
      inputSchema: {
        label: z.string().min(2).max(64).optional().describe('Key label (default agent)'),
        agentName: z.string().min(2).max(48).optional().describe('Your agent name for the label'),
        model: z.string().min(1).max(48).optional().describe('Model id e.g. claude, gpt, grok'),
      },
      annotations: { readOnlyHint: false, openWorldHint: true, destructiveHint: false },
    },
    async (input) => {
      const body: Record<string, unknown> = {}
      if (input.label) body.label = input.label
      if (input.agentName) body.agentName = input.agentName
      if (input.model) body.model = input.model
      const data = await crewFetch(cfg, '/api/agent/keys/claim', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      return asText({
        ...(typeof data === 'object' && data ? data : { raw: data }),
        tip: 'Store crew_ak_… once — it is not shown again. Set CREW_AGENT_API_KEY (local MCP) or pass x-crew-api-key (hosted). Then: crew_autohire → crew_launch_dry_run → crew_launch.',
      })
    },
  )

  server.registerTool(
    'crew_search_kols',
    {
      title: 'Search CREW KOL directory',
      description:
        'Search the CREW KOL / Pump profile directory by handle or wallet. Public Pump.fun profiles — not opt-in partners.',
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
        'Preview CREW narrative Autohire: match a Solana / Pump.fun token name, ticker, and vibe to the top KOL pack (wallets, roles, shares, reasons). No on-chain tx. Public Pump wallets — not endorsed affiliates. Requires CREW_AGENT_API_KEY.',
      inputSchema: {
        name: z.string().max(32).optional().describe('Token name (2–32 on launch)'),
        ticker: z.string().max(13).optional().describe('Token ticker (2–13 on launch)'),
        description: z
          .string()
          .max(204)
          .optional()
          .describe(
            'Narrative / vibe (≤204 — leaves room for “Launched from CrewPay.dev platform”)',
          ),
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
    'crew_launch_dry_run',
    {
      title: 'Dry-run a CREW launch (no chain tx)',
      description:
        'Dry-run a launch (default) or wire-fees (intent=wire-fees). Returns dryRunId + approvalUrl (no approve secret). Operator opens approvalUrl and wallet-signs before spend. Launch dry-run binds image sha256. Requires CREW_AGENT_API_KEY.',
      inputSchema: {
        intent: z
          .enum(['launch', 'wire-fees'])
          .optional()
          .describe('launch (default) or wire-fees'),
        name: z.string().min(2).max(32).optional(),
        ticker: z.string().min(2).max(13).optional(),
        description: z
          .string()
          .max(204)
          .optional()
          .describe('≤204 chars; attribution appended to reach ≤240 final'),
        imageUrl: z.string().url().optional().describe('Public image URL (or use imageBase64)'),
        imageBase64: z.string().min(64).optional(),
        seats: z.number().int().min(1).max(10).optional(),
        mode: z.enum(['agent', 'split', 'buyback', 'raid']).optional(),
        initialBuySol: z.number().min(0).max(10).optional(),
        twitter: z.string().max(128).optional(),
        website: z.string().url().optional(),
        holderKol: z.boolean().optional(),
        mint: mintSchema.optional().describe('Required when intent=wire-fees'),
        launcherPubkey: z
          .string()
          .min(32)
          .max(64)
          .optional()
          .describe('Optional public launcher address for balance check (never a secret)'),
        agentName: z.string().min(2).max(48).optional(),
        agentObjective: z.string().min(8).max(280).optional(),
        agentModel: z.string().max(48).optional(),
        crew: z.array(crewMemberSchema).min(1).max(10).optional(),
        ...forbiddenSecretFields,
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (input) => {
      assertNoSecretToolArgs(input as Record<string, unknown>)
      const intent = input.intent || 'launch'
      if (intent === 'wire-fees') {
        if (!input.mint) throw new Error('mint required when intent=wire-fees')
        const body: Record<string, unknown> = {
          intent: 'wire-fees',
          mint: input.mint,
          mode: input.mode || 'agent',
        }
        if (input.name) body.name = input.name
        if (input.ticker) body.ticker = input.ticker
        if (input.crew?.length) body.crew = input.crew
        const data = await crewFetch(cfg, '/api/agent/launch/dry-run', {
          method: 'POST',
          auth: true,
          body: JSON.stringify(body),
        })
        return asText(data)
      }
      if (!input.name || !input.ticker) throw new Error('name and ticker required for launch dry-run')
      if (!input.imageUrl && !input.imageBase64) {
        throw new Error('Provide imageUrl or imageBase64')
      }
      const body: Record<string, unknown> = {
        intent: 'launch',
        name: input.name,
        ticker: input.ticker,
        description: input.description || '',
        mode: input.mode || 'agent',
        initialBuySol: input.initialBuySol ?? 0,
        holderKol: input.holderKol ?? false,
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
      if (input.twitter) body.twitter = input.twitter
      if (input.website) body.website = input.website
      if (input.launcherPubkey) body.launcherPubkey = input.launcherPubkey
      if (input.holderKol) {
        /* holder path — no crew required */
      } else if (input.crew?.length) {
        body.crew = input.crew
      } else {
        body.autoHire = { seats: input.seats ?? 5 }
      }

      const data = await crewFetch(cfg, '/api/agent/launch/dry-run', {
        method: 'POST',
        auth: true,
        body: JSON.stringify(body),
      })
      return asText(data)
    },
  )

  server.registerTool(
    'crew_status',
    {
      title: 'Mint / fee-share status',
      description:
        'Check whether a CREW mint has fee-shares locked, Holder KOL open, and board presence. Use after launch (HTTP 202) or before wire/lock/crank.',
      inputSchema: {
        mint: mintSchema.describe('Pump mint address'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ mint }) => {
      const data = await crewFetch(cfg, `/api/agent/status/${encodeURIComponent(mint)}`, {
        auth: true,
      })
      return asText(data)
    },
  )

  server.registerTool(
    'crew_wire_fees',
    {
      title: 'Wire / repair CREW fee-shares',
      description:
        'Create + lock fee-sharing for an existing mint. Requires dryRunId from crew_launch_dry_run with intent=wire-fees after wallet approval on approvalUrl. Requires CREW_LAUNCHER_KEY in MCP env.',
      inputSchema: {
        dryRunId: z
          .string()
          .min(16)
          .max(64)
          .describe('From crew_launch_dry_run intent=wire-fees after human wallet approval'),
        mint: mintSchema,
        mode: z.enum(['agent', 'split', 'buyback', 'raid']).optional(),
        name: z.string().max(32).optional(),
        ticker: z.string().max(13).optional(),
        crew: z
          .array(crewMemberSchema)
          .min(1)
          .max(10)
          .optional()
          .describe('Optional — omit to reuse board crew from launch'),
        ...forbiddenSecretFields,
      },
      annotations: { readOnlyHint: false, openWorldHint: true, destructiveHint: true },
    },
    async (input) => {
      assertNoSecretToolArgs(input as Record<string, unknown>)
      const body: Record<string, unknown> = {
        dryRunId: input.dryRunId,
        mint: input.mint,
        mode: input.mode || 'agent',
      }
      if (input.name) body.name = input.name
      if (input.ticker) body.ticker = input.ticker
      if (input.crew?.length) body.crew = input.crew
      const data = await crewFetch(cfg, '/api/agent/wire-fees', {
        method: 'POST',
        auth: true,
        launcher: true,
        body: JSON.stringify(body),
      })
      return asText(data)
    },
  )

  server.registerTool(
    'crew_list_launches',
    {
      title: 'List launches for this agent key',
      description:
        'Return launches attributed to your crew_ak_… key (mint, ticker, feeShareLocked, pumpUrl). Operator env keys see recent board launches. Use after crew_launch or to recover mint state across retries.',
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ limit }) => {
      const qs = limit ? `?limit=${limit}` : ''
      const data = await crewFetch(cfg, `/api/agent/launches${qs}`, { auth: true })
      return asText(data)
    },
  )

  server.registerTool(
    'crew_lock_holder_kol',
    {
      title: 'Lock Holder-KOL fee-shares',
      description:
        'Scan top holders ∩ CREW KOL directory and permanently lock fee-shares (one-shot). Use when launch used holderKol=true. Requires CREW_LAUNCHER_KEY in MCP env.',
      inputSchema: {
        mint: mintSchema,
        mode: z.enum(['agent', 'split', 'buyback', 'raid']).optional(),
        name: z.string().max(32).optional(),
        ticker: z.string().max(13).optional(),
        ...forbiddenSecretFields,
      },
      annotations: { readOnlyHint: false, openWorldHint: true, destructiveHint: true },
    },
    async (input) => {
      assertNoSecretToolArgs(input as Record<string, unknown>)
      const data = await crewFetch(cfg, '/api/agent/lock-holder-kol', {
        method: 'POST',
        auth: true,
        launcher: true,
        body: JSON.stringify({
          mint: input.mint,
          mode: input.mode || 'agent',
          name: input.name,
          ticker: input.ticker,
        }),
      })
      return asText(data)
    },
  )

  server.registerTool(
    'crew_crank_remits',
    {
      title: 'Crank creator fee remits',
      description:
        'Distribute accrued creator fees (sweep + distributeCreatorFeesV2). Permissionless on-chain — uses CREW_LAUNCHER_KEY if set, else server CREW_OPS_KEY. Prefers OnlinePumpSdk builder so unswept bonding-curve fees do not fail with CreatorFeesNotSwept.',
      inputSchema: {
        mint: mintSchema,
        ...forbiddenSecretFields,
      },
      annotations: { readOnlyHint: false, openWorldHint: true, destructiveHint: true },
    },
    async (input) => {
      assertNoSecretToolArgs(input as Record<string, unknown>)
      // Launcher optional — API falls back to CREW_OPS_KEY / buyback key.
      const data = await crewFetch(cfg, '/api/agent/crank', {
        method: 'POST',
        auth: true,
        launcher: Boolean(cfg.launcherKey),
        body: JSON.stringify({ mint: input.mint }),
      })
      return asText(data)
    },
  )

  server.registerTool(
    'crew_proof',
    {
      title: 'Public CREW proof tape',
      description:
        'Load public proof tape: launches, remit totals, and buyback runs if any. Fee-shares lock 25% to CrewPay treasury; market buyback cron is not live yet — empty buyback rows ≠ failed fee-shares.',
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ limit }) => {
      const qs = limit ? `?limit=${limit}` : ''
      const data = await crewFetch(cfg, `/api/proof${qs}`)
      return asText(data)
    },
  )

  server.registerTool(
    'crew_launch',
    {
      title: 'Launch Pump coin via CrewPay (MAINNET)',
      description:
        'MAINNET launch: create a Solana Pump.fun coin with on-chain fee-shares (60% KOL crew / 15% launching agent / 25% CrewPay treasury). Buyback cron is not live yet. Prefers atomic create+fee-lock. Requires dryRunId from crew_launch_dry_run after a human opens approvalUrl. Requires CREW_AGENT_API_KEY + CREW_LAUNCHER_KEY in MCP env (never tool args). Check feeShareLocked — HTTP 202 needs crew_wire_fees.',
      inputSchema: {
        dryRunId: z
          .string()
          .min(16)
          .max(64)
          .describe('From crew_launch_dry_run after human approval on approvalUrl'),
        name: z.string().min(2).max(32),
        ticker: z
          .string()
          .min(2)
          .max(13)
          .regex(/^\$?[A-Za-z0-9]{2,13}$/, 'Ticker must be 2–13 letters/numbers'),
        description: z
          .string()
          .max(204)
          .optional()
          .describe('≤204 chars; attribution appended to reach ≤240 final'),
        imageUrl: z.string().url().optional().describe('Public image URL (or use imageBase64)'),
        imageBase64: z.string().min(64).optional(),
        seats: z.number().int().min(1).max(10).optional().describe('Autohire seats when crew omitted'),
        mode: z.enum(['agent', 'split', 'buyback', 'raid']).optional(),
        initialBuySol: z.number().min(0).max(10).optional().describe('Dev buy 0–10 SOL (site+API aligned)'),
        twitter: z.string().max(128).optional().describe('X / Twitter handle or URL'),
        website: z.string().url().optional(),
        holderKol: z
          .boolean()
          .optional()
          .describe('Open Holder-KOL (fees unlocked until crew_lock_holder_kol)'),
        agentName: z.string().min(2).max(48).optional(),
        agentObjective: z.string().min(8).max(280).optional(),
        agentModel: z.string().max(48).optional().describe('e.g. claude, gpt, gemini, grok'),
        idempotencyKey: z
          .string()
          .min(8)
          .max(128)
          .optional()
          .describe('Retry-safe key; replays cached launch for 15m'),
        crew: z
          .array(crewMemberSchema)
          .min(1)
          .max(10)
          .optional()
          .describe('Explicit crew (shares must total 100%) overrides Autohire when provided'),
        ...forbiddenSecretFields,
      },
      annotations: { readOnlyHint: false, openWorldHint: true, destructiveHint: true },
    },
    async (input) => {
      assertNoSecretToolArgs(input as Record<string, unknown>)
      if (!input.imageUrl && !input.imageBase64) {
        throw new Error('Provide imageUrl or imageBase64')
      }
      const body: Record<string, unknown> = {
        dryRunId: input.dryRunId,
        name: input.name,
        ticker: input.ticker,
        description: input.description || '',
        mode: input.mode || 'agent',
        initialBuySol: input.initialBuySol ?? 0,
        holderKol: input.holderKol ?? false,
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
      if (input.twitter) body.twitter = input.twitter
      if (input.website) body.website = input.website
      if (input.holderKol) {
        /* fees deferred */
      } else if (input.crew?.length) {
        body.crew = input.crew
      } else {
        body.autoHire = { seats: input.seats ?? 5 }
      }

      const data = await crewFetch(cfg, '/api/agent/launch', {
        method: 'POST',
        auth: true,
        launcher: true,
        idempotencyKey: input.idempotencyKey,
        body: JSON.stringify(body),
      })
      // API may return HTTP 202 with feeShareLocked=false. Wire-fees now needs its own
      // dry-run (intent=wire-fees) + wallet approval — do not auto-call wire here.
      const launchOut =
        data && typeof data === 'object' ? (data as Record<string, unknown>) : null
      if (launchOut && launchOut.feeShareLocked === false) {
        return asText({
          ...launchOut,
          tip: 'feeShareLocked=false — run crew_launch_dry_run with intent=wire-fees, open approvalUrl, then crew_wire_fees with that dryRunId.',
        })
      }
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
              'You are a crypto launch agent using CREW / CrewPay MCP tools on Solana MAINNET.',
              'Flow: crew_claim_key (if no key) → crew_discover → crew_autohire → crew_launch_dry_run → human opens approvalUrl → crew_launch(dryRunId) → crew_status → (crew_wire_fees | crew_lock_holder_kol) → crew_crank_remits.',
              'Never pass Solana secrets as tool args — they must live in MCP env (CREW_LAUNCHER_KEY).',
              'Autohire wallets are public Pump profiles, not consenting partners — open approvalUrl before launch.',
              'Prefer autoHire unless the user named specific wallets. Crew shares must total 100%. Always check feeShareLocked (atomic lock preferred).',
              `Idea: ${idea}`,
              ticker ? `Ticker hint: ${ticker}` : '',
              `Docs: ${DEFAULT_SITE_URL}/agents · ${DEFAULT_SITE_URL}/proof · ${DEFAULT_API_URL}/llms.txt`,
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
