import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import * as z from 'zod/v4'
import {
  asText,
  cfgCanX402Pay,
  crewFetch,
  loadConfig,
  DEFAULT_API_URL,
  DEFAULT_SITE_URL,
  type CrewApiConfig,
} from './client.js'
import { assertNoSecretToolArgs } from './secrets.js'

export function packageVersion(): string {
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
  wallet: z.string().min(20).max(64),
  share: z.number().int().min(1).max(100),
  hireRole: z.enum(['caller', 'chart', 'raid', 'kol', 'dev']).optional(),
  evmWallet: z.string().min(42).max(42).optional(),
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

  // Build UNSIGNED transactions for non-custodial signing
  server.registerTool(
    'crew_build_unsigned',
    {
      title: 'Build UNSIGNED launch transactions',
      description:
        'Create UNSIGNED launch transactions. platform defaults to pumpfun (Solana v0 messages). bags = Bags.fm Solana fee-claimers (needs BAGS_API_KEY). zora = Zora content coins on Base (EIP-1559; needs ZORA_ENABLED). Prefer explicit crew[] from crew_list_kols; Autohire is fallback. optInOnly default off. Fee map: 60% hired KOL crew / 15% launching agent / rest treasury (5% referrer when bound). Optional treasuryBps 2000–3000.',
      inputSchema: {
        name: z.string().min(2).max(32),
        ticker: z.string().min(2).max(13),
        description: z.string().max(204).optional(),
        imageUrl: z.string().url().optional(),
        imageBase64: z.string().min(64).optional(),
        seats: z.number().int().min(1).max(20).optional(),
        mode: z.enum(['agent', 'split', 'buyback', 'raid']).optional(),
        initialBuySol: z.number().min(0).max(10).optional(),
        twitter: z.string().max(128).optional(),
        website: z.string().url().optional(),
        launcherPubkey: z.string().min(20).max(64),
        mintPubkey: z.string().min(20).max(64).optional(),
        optInOnly: z.boolean().optional(),
        treasuryBps: z.number().int().min(2000).max(3000).optional(),
        platform: z
          .enum(['pumpfun', 'bags', 'zora'])
          .optional()
          .describe('Launch venue. Default pumpfun. bags=Bags.fm (Solana). zora=Zora coins (Base).'),
        crew: z.array(crewMemberSchema).min(1).max(100).optional(),
        ...forbiddenSecretFields,
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (input) => {
      assertNoSecretToolArgs(input as Record<string, unknown>)
      if (!input.imageUrl && !input.imageBase64) {
        throw new Error('Provide imageUrl or imageBase64')
      }
      const body: Record<string, unknown> = {
        name: input.name,
        ticker: input.ticker,
        description: input.description || '',
        mode: input.mode || 'agent',
        initialBuySol: input.initialBuySol ?? 0,
        launcherPubkey: input.launcherPubkey,
        ...(input.optInOnly != null ? { optInOnly: input.optInOnly } : {}),
        platform: input.platform || 'pumpfun',
      }
      if (input.imageUrl) body.imageUrl = input.imageUrl
      if (input.imageBase64) body.imageBase64 = input.imageBase64
      if (input.twitter) body.twitter = input.twitter
      if (input.website) body.website = input.website
      if (input.mintPubkey) body.mintPubkey = input.mintPubkey
      if (input.treasuryBps != null) body.treasuryBps = input.treasuryBps
      if (input.crew?.length) body.crew = input.crew
      else body.autoHire = { seats: input.seats ?? 5 }
      const data = await crewFetch(cfg, '/api/agent/launch/unsigned', {
        method: 'POST',
        auth: true,
        body: JSON.stringify(body),
      })
      return asText(data)
    },
  )

  // Submit previously built signed base64 transactions
  server.registerTool(
    'crew_submit_signed',
    {
      title: 'Submit signed CREW launch transactions',
      description:
        'Submit signed transactions from crew_build_unsigned. Pump.fun/Bags: Solana base64 (create then lock / fee-share then create). Zora: EIP-1559 hex (0xSplits then coin create). Pass platform to match the builder.',
      inputSchema: {
        signed: z.array(z.string().min(64)).min(1).max(8),
        platform: z.enum(['pumpfun', 'bags', 'zora']).optional(),
      },
      annotations: { readOnlyHint: false, openWorldHint: true, destructiveHint: true },
    },
    async (input) => {
      const data = await crewFetch(cfg, '/api/agent/launch/submit', {
        method: 'POST',
        auth: true,
        body: JSON.stringify({ signed: input.signed, platform: input.platform || 'pumpfun' }),
      })
      return asText(data)
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
        tip: 'Safe flow: crew_claim_key (if needed) → crew_discover → crew_autohire → crew_launch. Approval is optional. Operators can require human approval per key (then: crew_launch_dry_run → approvalUrl → crew_launch(dryRunId)). Secrets stay in MCP env only.',
        auth: {
          reads: 'crew_discover / crew_search_kols / crew_proof / crew_claim_key / crew_autohire (keyless preview) need no API key',
          writes: cfg.publicMode
            ? 'Pass x-crew-api-key on the MCP HTTP request (or run locally with CREW_AGENT_API_KEY or X402_EVM_PRIVATE_KEY). Mint via crew_claim_key or POST /api/agent/keys/claim.'
            : 'Set CREW_AGENT_API_KEY in MCP env (mint via crew_claim_key), or X402_EVM_PRIVATE_KEY to pay per call with x402 (no key). Operator mint: POST /api/agent/keys.',
          x402: 'Optional. Local MCP with X402_EVM_PRIVATE_KEY pays USDC on Base when the API returns 402. Hosted public MCP never uses a shared x402 wallet.',
          launcher: cfg.publicMode
            ? 'Public hosted MCP cannot launch with your wallet — run crewpay-mcp locally with CREW_LAUNCHER_KEY, or use REST x-launcher-key from your backend.'
            : 'Set CREW_LAUNCHER_KEY in MCP env — never pass Solana secrets as tool arguments.',
        },
        publicMode: Boolean(cfg.publicMode),
      })
    },
  )

  // Jobs + escrow (test/devnet only) — gated by JOBS_ENABLED
  const jobsEnabled =
    (process.env.JOBS_ENABLED || '').trim().toLowerCase() === '1' ||
    (process.env.JOBS_ENABLED || '').trim().toLowerCase() === 'true'
  if (jobsEnabled) {
    server.registerTool(
      'crew_job_create_dry_run',
      {
        title: 'Dry-run: create a campaign job (test/devnet only)',
        description:
          'Plan a paid campaign job (multichain, per-proof payouts). Test/devnet only; no funds moved. Returns computed caps and plan. Behind JOBS_ENABLED.',
        inputSchema: {
          chainId: z
            .enum(['solana-devnet', 'solana', 'evm:base-sepolia', 'evm:base', 'evm:ethereum', 'flop-testnet'])
            .describe('Target chain'),
          asset: z.enum(['SOL', 'USDC', 'ETH', 'USDT']).describe('Payout asset'),
          budget: z.number().positive().describe('Total budget (test units)'),
          perProofAmount: z.number().positive().describe('Per verified post amount (test units)'),
          maxProofs: z.number().int().min(1).max(10000),
          perKOLCap: z.number().int().min(1).max(1000).optional().describe('Max proofs per KOL'),
          deadlineHours: z.number().int().min(1).max(720).optional().describe('Deadline in hours'),
          requiredTicker: z.string().max(24).optional(),
          requiredLink: z.string().url().optional(),
          minPostAgeHours: z.number().int().min(0).max(72).optional(),
        },
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async (input) => {
        const body: Record<string, unknown> = {
          chainId: input.chainId,
          asset: input.asset,
          budget: input.budget,
          perProofAmount: input.perProofAmount,
          maxProofs: input.maxProofs,
          perKOLCap: input.perKOLCap ?? 5,
          deadlineHours: input.deadlineHours ?? 24,
          rules: {
            requiredTicker: input.requiredTicker,
            requiredLink: input.requiredLink,
            minPostAgeHours: input.minPostAgeHours ?? 0,
          },
        }
        const data = await crewFetch(cfg, '/api/jobs/campaigns/dry-run', {
          method: 'POST',
          auth: true,
          body: JSON.stringify(body),
        })
        return asText(data)
      },
    )
    server.registerTool(
      'crew_job_list',
      {
        title: 'List open jobs (test/devnet only)',
        description: 'List open/funded campaign jobs. Test-only; behind JOBS_ENABLED.',
        inputSchema: {},
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async () => {
        const data = await crewFetch(cfg, '/api/jobs/open')
        return asText(data)
      },
    )
  }

  server.registerTool(
    'crew_claim_key',
    {
      title: 'Claim a self-serve CREW API key',
      description:
        'Mint a crew_ak_… agent API key with no operator signup (POST /api/agent/keys/claim). Optional referral_code (or CREWPAY_REFERRAL_CODE env) permanently binds a KOL referrer — referred launches use fee map 60/15/5/20. Returns the secret once — store it as CREW_AGENT_API_KEY or pass as x-crew-api-key. Rate-limited 5/hour/IP. Default 5 launches/hour. Use before autohire/launch when you have no key.',
      inputSchema: {
        label: z.string().min(2).max(64).optional().describe('Key label (default agent)'),
        agentName: z.string().min(2).max(48).optional().describe('Your agent name for the label'),
        model: z.string().min(1).max(48).optional().describe('Model id e.g. claude, gpt, grok'),
        referral_code: z
          .string()
          .min(2)
          .max(24)
          .optional()
          .describe(
            'KOL referral code (crewpay.dev/r/<code>). Bound permanently on this key. Falls back to CREWPAY_REFERRAL_CODE env.',
          ),
      },
      annotations: { readOnlyHint: false, openWorldHint: true, destructiveHint: false },
    },
    async (input) => {
      const body: Record<string, unknown> = {}
      if (input.label) body.label = input.label
      if (input.agentName) body.agentName = input.agentName
      if (input.model) body.model = input.model
      const referralCode =
        (input.referral_code || '').trim() ||
        (process.env.CREWPAY_REFERRAL_CODE || process.env.CREW_REFERRAL_CODE || '').trim()
      if (referralCode) body.referralCode = referralCode
      const data = await crewFetch(cfg, '/api/agent/keys/claim', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      return asText({
        ...(typeof data === 'object' && data ? data : { raw: data }),
        tip: 'Store crew_ak_… once — it is not shown again. Set CREW_AGENT_API_KEY (local MCP) or pass x-crew-api-key (hosted). Then: crew_autohire → crew_launch_dry_run → crew_launch. Referral codes are immutable after claim.',
      })
    },
  )

  server.registerTool(
    'crew_search_kols',
    {
      title: 'Search CREW KOL directory',
      description:
        'Search the CREW KOL / Pump profile directory by handle or wallet. Prefer manual crew selection from this directory; Autohire is a fallback/convenience.',
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

  // Browse KOLs (optional q), for manual crew selection
  server.registerTool(
    'crew_list_kols',
    {
      title: 'Browse CREW KOL directory',
      description:
        'List/browse CREW KOL profiles (optionally filtered by q). Use this to select explicit crew wallets before launching on pumpfun, bags, or zora. Manual pick first; Autohire is a fallback. For Zora, prefer registered evm_wallet / pass Base addresses.',
      inputSchema: {
        q: z.string().max(64).optional().describe('Optional: handle, pump username, or wallet substring'),
        limit: z.number().int().min(1).max(100).optional().describe('Max results (default 50)'),
        offset: z.number().int().min(0).optional().describe('Offset for pagination (default 0)'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ q, limit, offset }) => {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      if (limit != null) params.set('limit', String(limit))
      if (offset != null) params.set('offset', String(offset))
      const qs = params.toString() ? `?${params.toString()}` : ''
      const data = await crewFetch(cfg, `/api/kols${qs}`)
      return asText(data)
    },
  )

  server.registerTool(
    'crew_autohire',
    {
      title: 'Narrative Autohire KOLs',
      description:
        'Preview convenience Autohire: match a token name/ticker/vibe to a candidate KOL pack. Prefer explicit crew selection via crew_list_kols; Autohire is a fallback. Works keyless for previews.',
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
        seats: z.number().int().min(1).max(8).optional().describe('Crew seats 1–8 (default 5)'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (input) => {
      if (!cfg.apiKey && !cfgCanX402Pay(cfg)) {
        // No key yet: use the read-only no-auth preview so first contact always works.
        const qs = new URLSearchParams({
          name: input.name || '',
          ticker: input.ticker || '',
          description: input.description || '',
          seats: String(input.seats ?? 5),
        })
        const preview = await crewFetch(cfg, `/api/agent/quickstart?${qs}`)
        return asText({
          ...(preview as Record<string, unknown>),
          keyless: true,
          tip: 'Keyless preview (no API key on this session). Call crew_claim_key to get crew_ak_…, or set X402_EVM_PRIVATE_KEY to pay per call, then crew_launch_dry_run / crew_launch.',
        })
      }
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
        'Dry-run a launch (default) or wire-fees (intent=wire-fees). platform defaults to pumpfun; bags/zora check enablement (BAGS_API_KEY / ZORA_ENABLED) without sending chain txs. Prefer explicit crew[] from crew_list_kols; Autohire is a fallback. Returns dryRunId + approvalUrl. Requires CREW_AGENT_API_KEY.',
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
        seats: z.number().int().min(1).max(8).optional(),
        mode: z.enum(['agent', 'split', 'buyback', 'raid']).optional(),
        initialBuySol: z.number().min(0).max(10).optional(),
        twitter: z.string().max(128).optional(),
        website: z.string().url().optional(),
        holderKol: z.boolean().optional(),
        mint: mintSchema.optional().describe('Required when intent=wire-fees'),
        launcherPubkey: z
          .string()
          .min(20)
          .max(64)
          .optional()
          .describe('Optional public launcher address for balance check (never a secret)'),
        agentName: z.string().min(2).max(48).optional(),
        agentObjective: z.string().min(8).max(280).optional(),
        agentModel: z.string().max(48).optional(),
        crew: z.array(crewMemberSchema).min(1).max(100).optional(),
        platform: z.enum(['pumpfun', 'bags', 'zora']).optional(),
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
        platform: input.platform || 'pumpfun',
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
        'Create + lock fee-sharing for an existing mint. Approval is optional. Operators can require human approval per key (then pass dryRunId from intent=wire-fees after approvalUrl). Requires CREW_LAUNCHER_KEY in MCP env.',
      inputSchema: {
        dryRunId: z
          .string()
          .min(16)
          .max(64)
          .optional()
          .describe('Optional unless the API key has requireApproval=true'),
        mint: mintSchema,
        mode: z.enum(['agent', 'split', 'buyback', 'raid']).optional(),
        name: z.string().max(32).optional(),
        ticker: z.string().max(13).optional(),
        crew: z
          .array(crewMemberSchema)
          .min(1)
          .max(8)
          .optional()
          .describe('Optional — omit to reuse board crew from launch'),
        ...forbiddenSecretFields,
      },
      annotations: { readOnlyHint: false, openWorldHint: true, destructiveHint: true },
    },
    async (input) => {
      assertNoSecretToolArgs(input as Record<string, unknown>)
      const body: Record<string, unknown> = {
        mint: input.mint,
        mode: input.mode || 'agent',
      }
      if (input.dryRunId) body.dryRunId = input.dryRunId
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
        'Load public proof tape: launches, remit totals, and buyback runs if any. Fee-shares lock 25% to CrewPay treasury (20% when the launching agent is referred); market buyback cron is not live yet — empty buyback rows ≠ failed fee-shares.',
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
        'MAINNET launch: Prefer explicit crew[] (from crew_list_kols). Autohire is a fallback convenience. Creates a Pump.fun coin with on-chain fee-shares (60/15/25 default; 60/15/5/20 with referral). Approval optional; requires CREW_AGENT_API_KEY + CREW_LAUNCHER_KEY. Check feeShareLocked.',
      inputSchema: {
        dryRunId: z
          .string()
          .min(16)
          .max(64)
          .optional()
          .describe('Optional unless the API key has requireApproval=true'),
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
        seats: z.number().int().min(1).max(8).optional().describe('Autohire seats when crew omitted'),
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
          .max(8)
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
      if (input.dryRunId) body.dryRunId = input.dryRunId
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
