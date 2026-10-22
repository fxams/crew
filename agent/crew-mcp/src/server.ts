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
  .describe(
    'Solana mint address (base58, 32–64 chars, alphabet without 0/O/I/l). Example: a Pump.fun mint from crew_list_launches or crew_status. Required unless noted.',
  )

const crewMemberSchema = z.object({
  handle: z
    .string()
    .describe('X / Pump handle without @. Example: "crewpayhq". Required.'),
  wallet: z
    .string()
    .min(20)
    .max(64)
    .describe('Solana payout wallet (base58). Required. Example: a KOL wallet from crew_list_kols.'),
  share: z
    .number()
    .int()
    .min(1)
    .max(100)
    .describe('Integer percent of the crew slice (1–100). Crew shares must total 100.'),
  hireRole: z
    .enum(['caller', 'chart', 'raid', 'kol', 'dev'])
    .optional()
    .describe('Optional hire role label. One of caller | chart | raid | kol | dev.'),
  evmWallet: z
    .string()
    .min(42)
    .max(42)
    .optional()
    .describe('Optional 0x… Base address (42 chars) for Zora/Clanker payouts.'),
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
        'The launching agent earns 15% of creator fees onchain. Creator fees follow trading volume and can be zero. Create UNSIGNED launch transactions. For Pump.fun, mintPubkey is required: generate a mint keypair locally and pass its public key so you can sign the create tx. The API does not keep a server-side mint secret. Pump.fun fee-share is part of this launch (same v0 tx when it fits; otherwise an ordered pair). Sign every returned step together in one wallet signAllTransactions or one Jito bundle — do not skip the lock step. crew_wire_fees is repair-only. platform defaults to pumpfun (Solana v0 messages). bags = Bags.fm Solana fee-claimers (needs BAGS_API_KEY). zora = Zora content coins on Base (EIP-1559; needs ZORA_ENABLED). clanker = Clanker v4 on Base (EIP-1559; needs CLANKER_ENABLED). vibevibe = vibe/vibe on Robinhood Chain (EIP-1559; needs VIBEVIBE_ENABLED). sui = Memez.gg / Blast.fun on Sui testnet (sui-tx; needs SUI_ENABLED, two steps publish+pool, optional treasuryCapObjectId). Prefer explicit crew[] from crew_list_kols; Autohire is fallback. optInOnly default off. Fee map: 60% to the KOL crew, 15% to the launching agent, 25% to the treasury (5% referrer when bound). Optional treasuryBps 2000–3000.',
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
        mintPubkey: z
          .string()
          .min(20)
          .max(64)
          .optional()
          .describe(
            'Required for Pump.fun. Caller-generated mint public key. The API never invents or stores a mint secret.',
          ),
        optInOnly: z.boolean().optional(),
        treasuryBps: z.number().int().min(2000).max(3000).optional(),
        platform: z
          .enum(['pumpfun', 'bags', 'zora', 'clanker', 'vibevibe', 'sui'])
          .optional()
          .describe('Launch venue. Default pumpfun. bags=Bags.fm (Solana). zora=Zora coins (Base).'),
        crew: z.array(crewMemberSchema).min(1).max(100).optional(),
        ...forbiddenSecretFields,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (input) => {
      assertNoSecretToolArgs(input as Record<string, unknown>)
      if (!input.imageUrl && !input.imageBase64) {
        throw new Error('Provide imageUrl or imageBase64')
      }
      if ((input.platform || 'pumpfun') === 'pumpfun' && !input.mintPubkey) {
        throw new Error(
          'mintPubkey is required for Pump.fun unsigned builds. Generate a mint keypair locally and pass its public key so you can sign the create tx. The API does not keep a server-side mint secret.',
        )
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
        'Submit signed transactions from crew_build_unsigned. Pump.fun: sign create + fee-share lock together (signAllTransactions / Jito bundle) — fees lock at launch; do not submit create alone. Bags: Solana base64 (fee-share then create). Zora: EIP-1559 hex (0xSplits then coin create). Pass platform to match the builder.',
      inputSchema: {
        signed: z.array(z.string().min(64)).min(1).max(8),
        platform: z.enum(['pumpfun', 'bags', 'zora', 'clanker', 'vibevibe', 'sui']).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
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
        'Load CREW / CrewPay discovery for crypto agents: Autohire KOLs, launch Pump.fun / Bags / Zora / Clanker coins, fee-shares, OpenAPI links. Use this first when working on Solana meme coins, KOLs, or CrewPay.',
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => {
      const data = await crewFetch(cfg, '/api/agent')
      return asText({
        site: DEFAULT_SITE_URL,
        api: cfg.apiUrl,
        docs: `${DEFAULT_SITE_URL}/agents`,
        llms: `${cfg.apiUrl}/llms.txt`,
        discovery: data,
        tip: 'Safe flow: crew_claim_key (if needed) → crew_discover → crew_list_kols (or crew_autohire fallback) → crew_build_unsigned (Pump: mintPubkey required; returns create+lock with signTogether / atomic-v0) → signAllTransactions → crew_submit_signed. Custodial alternate: crew_launch_dry_run → crew_launch (fees locked at launch). crew_wire_fees is repair-only. Approval is optional. Operators can require human approval per key. Secrets stay in MCP env only.',
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
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
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
        description: 'List open/funded campaign jobs. Test-only; behind JOBS_ENABLED. Optional mint filter.',
        inputSchema: {
          mint: z.string().min(32).max(64).optional().describe('Filter jobs for a CrewPay-launched mint'),
        },
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      },
      async (input) => {
        const q = input.mint ? `?mint=${encodeURIComponent(input.mint)}` : ''
        const data = await crewFetch(cfg, `/api/jobs/open${q}`)
        return asText(data)
      },
    )
    const contentChain = z.enum(['solana-devnet', 'evm:base-sepolia', 'flop-testnet'])
    server.registerTool(
      'crew_post_content_job',
      {
        title: 'Post a paid content brief (thread/meme/post)',
        description:
          'Agent-funded content contest on existing jobs+escrow. Humans submit an X status URL + note; you pick one winner (not first-to-claim). Approving builds an unsigned payout for you to sign. DEVNET only. Non-custodial. No new escrow program.',
        inputSchema: {
          kind: z.enum(['thread', 'meme', 'post']).describe('Brief kind'),
          title: z.string().min(3).max(120),
          brief: z.string().min(8).max(20_000).describe('What to post'),
          chainId: contentChain.describe('Test/devnet only — mainnet rejected'),
          asset: z.enum(['SOL', 'USDC', 'ETH', 'USDT']),
          reward: z.number().positive().describe('Single winner reward (test units)'),
          deadlineHours: z.number().int().min(1).max(720).optional(),
          fund: z.boolean().optional().describe('Fund sim/devnet escrow on create'),
          rail: z.string().max(32).optional(),
          from: z.string().max(128).optional().describe('Creator wallet for non-custodial rails'),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      },
      async (input) => {
        const data = await crewFetch(cfg, '/api/jobs/content', {
          method: 'POST',
          auth: true,
          body: JSON.stringify({
            kind: input.kind,
            title: input.title,
            brief: input.brief,
            chainId: input.chainId,
            asset: input.asset,
            reward: input.reward,
            deadlineHours: input.deadlineHours ?? 24,
            fund: input.fund,
            rail: input.rail,
            from: input.from,
          }),
        })
        return asText(data)
      },
    )
    server.registerTool(
      'crew_list_content_jobs',
      {
        title: 'List paid content jobs and submissions',
        description:
          'Browse content contests (thread/meme/post) and optional job detail with submissions. Test/devnet. Behind JOBS_ENABLED.',
        inputSchema: {
          jobId: z.string().min(8).max(64).optional().describe('If set, return that job + submissions'),
          kind: z.enum(['thread', 'meme', 'post']).optional(),
          status: z.string().max(32).optional(),
        },
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      },
      async (input) => {
        if (input.jobId) {
          const data = await crewFetch(cfg, `/api/jobs/content/${encodeURIComponent(input.jobId)}`)
          return asText(data)
        }
        const q = new URLSearchParams()
        if (input.kind) q.set('kind', input.kind)
        if (input.status) q.set('status', input.status)
        const qs = q.toString() ? `?${q.toString()}` : ''
        const data = await crewFetch(cfg, `/api/jobs${qs}`)
        return asText(data)
      },
    )
    server.registerTool(
      'crew_submit_content_proof',
      {
        title: 'Submit X proof for a content job',
        description:
          'Human proof: X/Twitter status URL + note. Multiple submissions allowed; the agent picks the winner. Requires wallet, timestamp, and signature of crew-content-submit:{jobId}:{ts}. MCP cannot sign.',
        inputSchema: {
          jobId: z.string().min(8).max(64),
          xUrl: z.string().url().describe('https X/Twitter status URL'),
          note: z.string().max(4000).optional(),
          handle: z.string().max(32).optional(),
          wallet: z.string().min(20).max(128).optional(),
          timestamp: z.number().int().optional(),
          signature: z.string().min(20).optional(),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      },
      async (input) => {
        if (!input.wallet || !input.timestamp || !input.signature) {
          throw new Error(
            'Submit requires wallet, timestamp, and signature (crew-content-submit:{jobId}:{ts}). Sign off-device.',
          )
        }
        const data = await crewFetch(cfg, `/api/jobs/content/${encodeURIComponent(input.jobId)}/submit`, {
          method: 'POST',
          headers: {
            'x-crew-wallet': input.wallet,
            'x-crew-timestamp': String(input.timestamp),
            'x-crew-signature': input.signature,
          },
          body: JSON.stringify({ xUrl: input.xUrl, note: input.note, handle: input.handle }),
        })
        return asText(data)
      },
    )
    server.registerTool(
      'crew_pick_content_winner',
      {
        title: 'Pick a content-job winner (unsigned payout)',
        description:
          'Agent selects one submission as the winner and builds an unsigned payout transaction to sign. Not first-to-claim. Reject with reject=true to refund. DEVNET only. Non-custodial — never send private keys.',
        inputSchema: {
          jobId: z.string().min(8).max(64),
          submissionId: z.string().min(8).max(64).optional(),
          from: z.string().max(128).optional().describe('Holder wallet for unsigned payout'),
          reject: z.boolean().optional().describe('If true, refund the agent instead of picking'),
          to: z.string().max(128).optional().describe('Refund address when reject=true'),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      },
      async (input) => {
        if (input.reject) {
          const data = await crewFetch(cfg, `/api/jobs/content/${encodeURIComponent(input.jobId)}/reject`, {
            method: 'POST',
            auth: true,
            body: JSON.stringify({ from: input.from, to: input.to }),
          })
          return asText(data)
        }
        if (!input.submissionId) {
          throw new Error('Provide submissionId to pick a winner, or reject=true to refund.')
        }
        const data = await crewFetch(cfg, `/api/jobs/content/${encodeURIComponent(input.jobId)}/pick`, {
          method: 'POST',
          auth: true,
          body: JSON.stringify({ submissionId: input.submissionId, from: input.from }),
        })
        return asText(data)
      },
    )
    server.registerTool(
      'crew_job_templates',
      {
        title: 'List post-launch creative job templates',
        description:
          'Presets for a launched coin: meme-pack, banner-logo, x-upkeep (N posts/week), website-polish. Jobs + escrow, test/devnet. No earnings promises.',
        inputSchema: {},
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      },
      async () => {
        const data = await crewFetch(cfg, '/api/jobs/templates')
        return asText(data)
      },
    )
    server.registerTool(
      'post_coin_job',
      {
        title: 'Post a creative job for a CrewPay-launched coin',
        description:
          'One-click template on the existing jobs+escrow system: meme-pack, banner-logo, x-upkeep, website-polish. Agents post with escrowed budget; humans claim, deliver, get paid after verification. Test/devnet only — mainnet chain ids are rejected. Public coin page: https://crewpay.dev/coin/<mint>. No earnings promises. Launch fee map stays 60% KOL crew / 15% launching agent / 25% treasury.',
        inputSchema: {
          mint: z.string().min(32).max(64).describe('Coin mint from a CrewPay launch'),
          template: z
            .enum(['meme-pack', 'banner-logo', 'x-upkeep', 'website-polish'])
            .describe('Creative job preset'),
          chainId: z
            .enum(['solana-devnet', 'evm:base-sepolia', 'flop-testnet'])
            .describe('Test/devnet only'),
          asset: z.enum(['SOL', 'USDC', 'ETH', 'USDT']).describe('Payout asset'),
          budget: z.number().positive().optional().describe('Total budget (test units)'),
          perProofAmount: z.number().positive().optional(),
          postsPerWeek: z.number().int().min(1).max(21).optional().describe('X upkeep: posts per week'),
          deadlineHours: z.number().int().min(1).max(720).optional(),
          ticker: z.string().max(16).optional(),
          fund: z.boolean().optional().describe('If true, fund sim/flop-tclk escrow (never mainnet)'),
          dryRun: z.boolean().optional().describe('If true, plan only — do not persist'),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      },
      async (input) => {
        const body: Record<string, unknown> = {
          mint: input.mint,
          template: input.template,
          chainId: input.chainId,
          asset: input.asset,
        }
        if (input.budget != null) body.budget = input.budget
        if (input.perProofAmount != null) body.perProofAmount = input.perProofAmount
        if (input.postsPerWeek != null) body.postsPerWeek = input.postsPerWeek
        if (input.deadlineHours != null) body.deadlineHours = input.deadlineHours
        if (input.ticker) body.ticker = input.ticker
        if (input.fund) body.fund = true
        const path = input.dryRun ? '/api/jobs/coin/dry-run' : '/api/jobs/coin'
        const data = await crewFetch(cfg, path, {
          method: 'POST',
          auth: true,
          body: JSON.stringify(body),
        })
        return asText(data)
      },
    )

    const taskChain = z.enum([
      'solana-devnet',
      'solana',
      'evm:base-sepolia',
      'evm:base',
      'evm:ethereum',
      'flop-testnet',
    ])
    const taskAsset = z.enum(['SOL', 'USDC', 'ETH', 'USDT'])
    const autoChecksInput = z
      .object({
        requireHttpsUrls: z.boolean().optional(),
        urlReachable: z.boolean().optional(),
        xPost: z.boolean().optional(),
        requiredTicker: z.string().max(24).optional(),
        requiredLink: z.string().url().optional(),
        minUrls: z.number().int().min(0).max(32).optional(),
        minTextLength: z.number().int().min(0).optional(),
        keyword: z.string().max(256).optional(),
        regex: z.string().max(256).optional(),
        fileExtensions: z.array(z.string().max(16)).max(16).optional(),
        minFiles: z.number().int().min(0).optional(),
        maxFiles: z.number().int().min(0).optional(),
      })
      .optional()

    server.registerTool(
      'crew_post_task',
      {
        title: 'Post a generic funded task (jobs + escrow)',
        description:
          'Post any task (labeling, QA, research, etc.) with title, spec, reward per slot, slots, deadline, and optional auto-checks. Locks budget via escrow (sim/devnet unsigned flow). Platform fee defaults to 0 (JOBS_PLATFORM_FEE_BPS). Launch fee map unchanged.',
        inputSchema: {
          title: z.string().min(3).max(120),
          spec: z.string().min(10).max(20_000),
          taskCategory: z.string().max(64).optional(),
          chainId: taskChain,
          asset: taskAsset,
          budget: z.number().positive(),
          rewardPerSlot: z.number().positive(),
          slots: z.number().int().min(1).max(10_000),
          slotsPerWorker: z.number().int().min(1).max(100).optional(),
          deadlineHours: z.number().int().min(1).max(720).optional(),
          autoChecks: autoChecksInput,
          objectionWindowHours: z.number().int().min(0).max(168).optional(),
          fund: z.boolean().optional().describe('Fund sim/flop-tclk escrow on create (never custodial mainnet spend)'),
          rail: z.string().max(32).optional(),
          from: z.string().max(128).optional().describe('Funding wallet for non-custodial rails'),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      },
      async (input) => {
        const data = await crewFetch(cfg, '/api/tasks', {
          method: 'POST',
          auth: true,
          body: JSON.stringify(input),
        })
        return asText(data)
      },
    )

    server.registerTool(
      'crew_list_tasks',
      {
        title: 'List open generic tasks',
        description: 'Browse agent-posted tasks (jobs+escrow). Optional category filter.',
        inputSchema: {
          category: z.string().max(64).optional(),
        },
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      },
      async (input) => {
        const q = input.category ? `?category=${encodeURIComponent(input.category)}` : ''
        const data = await crewFetch(cfg, `/api/tasks${q}`)
        return asText(data)
      },
    )

    server.registerTool(
      'crew_claim_task',
      {
        title: 'Claim a task slot (worker wallet)',
        description:
          'Claim a slot on a funded task. Requires worker wallet headers (x-crew-wallet, x-crew-timestamp, x-crew-signature) — MCP cannot sign; use REST from a wallet client or document headers for your agent operator.',
        inputSchema: {
          taskId: z.string().min(8).max(64),
          kolHandle: z.string().max(32).optional(),
          wallet: z.string().min(20).max(128).optional(),
          timestamp: z.number().int().optional(),
          signature: z.string().min(20).optional(),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      },
      async (input) => {
        if (!input.wallet || !input.timestamp || !input.signature) {
          throw new Error(
            'Worker claim requires wallet, timestamp, and signature (crew-task-claim message). Sign off-device and pass headers via crewFetch proxy or REST.',
          )
        }
        const data = await crewFetch(cfg, `/api/tasks/${encodeURIComponent(input.taskId)}/claim`, {
          method: 'POST',
          headers: {
            'x-crew-wallet': input.wallet,
            'x-crew-timestamp': String(input.timestamp),
            'x-crew-signature': input.signature,
          },
          body: JSON.stringify({ kolHandle: input.kolHandle }),
        })
        return asText(data)
      },
    )

    server.registerTool(
      'crew_submit_task',
      {
        title: 'Submit task proof',
        description: 'Submit URLs, text, and/or file metadata for a claimed task slot.',
        inputSchema: {
          taskId: z.string().min(8).max(64),
          urls: z.array(z.string().url()).optional(),
          text: z.string().max(50_000).optional(),
          files: z
            .array(
              z.object({
                name: z.string().max(256),
                url: z.string().url().optional(),
                mime: z.string().max(128).optional(),
                size: z.number().int().optional(),
              }),
            )
            .optional(),
          wallet: z.string().min(20).max(128).optional(),
          timestamp: z.number().int().optional(),
          signature: z.string().min(20).optional(),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      },
      async (input) => {
        if (!input.wallet || !input.timestamp || !input.signature) {
          throw new Error('Submit requires wallet signature (crew-task-submit message).')
        }
        const data = await crewFetch(cfg, `/api/tasks/${encodeURIComponent(input.taskId)}/submit`, {
          method: 'POST',
          headers: {
            'x-crew-wallet': input.wallet,
            'x-crew-timestamp': String(input.timestamp),
            'x-crew-signature': input.signature,
          },
          body: JSON.stringify({ urls: input.urls, text: input.text, files: input.files }),
        })
        return asText(data)
      },
    )

    server.registerTool(
      'crew_approve_task',
      {
        title: 'Approve or object to task proof (agent)',
        description:
          'Agent approves payout (unsigned release) or objects to block auto-release. Use object=true to veto before the objection window ends.',
        inputSchema: {
          taskId: z.string().min(8).max(64),
          claimId: z.string().optional(),
          object: z.boolean().optional(),
          from: z.string().max(128).optional(),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      },
      async (input) => {
        const data = await crewFetch(cfg, `/api/tasks/${encodeURIComponent(input.taskId)}/approve`, {
          method: 'POST',
          auth: true,
          body: JSON.stringify({
            claimId: input.claimId,
            object: input.object,
            from: input.from,
          }),
        })
        return asText(data)
      },
    )

    server.registerTool(
      'crew_dispute_task',
      {
        title: 'Open a task dispute (agent or worker)',
        description:
          'Freeze escrow and open a dispute. Workers must pass wallet signature; agents use API key.',
        inputSchema: {
          taskId: z.string().min(8).max(64),
          reason: z.string().min(8).max(2000),
          claimId: z.string().optional(),
          wallet: z.string().optional(),
          timestamp: z.number().int().optional(),
          signature: z.string().optional(),
        },
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
      },
      async (input) => {
        const headers: Record<string, string> = {}
        if (input.wallet && input.timestamp && input.signature) {
          headers['x-crew-wallet'] = input.wallet
          headers['x-crew-timestamp'] = String(input.timestamp)
          headers['x-crew-signature'] = input.signature
        }
        const data = await crewFetch(cfg, `/api/tasks/${encodeURIComponent(input.taskId)}/dispute`, {
          method: 'POST',
          auth: !(input.wallet && input.signature),
          headers,
          body: JSON.stringify({ reason: input.reason, claimId: input.claimId }),
        })
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
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
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
        tip: 'Store crew_ak_… once — it is not shown again. Set CREW_AGENT_API_KEY (local MCP) or pass x-crew-api-key (hosted). Then: crew_list_kols (or crew_autohire) → crew_build_unsigned (mintPubkey for Pump) → signAllTransactions → crew_submit_signed. Custodial: crew_launch_dry_run → crew_launch (fees locked at launch). Referral codes are immutable after claim.',
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
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
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
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
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
        'The launching agent earns 15% of creator fees onchain. Creator fees follow trading volume and can be zero. Preview convenience Autohire: match a token name/ticker/vibe to a candidate KOL pack. Prefer explicit crew selection via crew_list_kols; Autohire is a fallback. Works keyless for previews.',
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
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
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
    'crew_notify_hired_crew',
    {
      title: 'Notify hired crew on Telegram',
      description:
        'DM hired KOLs via @CrewPay_Bot. Opt-in only: they must have linked Telegram, sent /start, and enabled alerts. Never uses channel member counts.',
      inputSchema: {
        mint: z.string().max(64).optional().describe('Coin mint — notifies that launch’s hired crew'),
        handles: z
          .array(z.string().max(32))
          .max(20)
          .optional()
          .describe('Optional hired handles if mint is omitted'),
        message: z.string().max(500).optional().describe('Optional short note (≤500)'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (input) => {
      const data = await crewFetch(cfg, '/api/agent/crew/notify-telegram', {
        method: 'POST',
        auth: true,
        body: JSON.stringify({
          mint: input.mint || undefined,
          handles: input.handles,
          message: input.message,
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
        'The launching agent earns 15% of creator fees onchain. Creator fees follow trading volume and can be zero. Dry-run a launch (default) or wire-fees (intent=wire-fees). platform defaults to pumpfun; bags/zora check enablement (BAGS_API_KEY / ZORA_ENABLED) without sending chain txs. Prefer explicit crew[] from crew_list_kols; Autohire is a fallback. Returns dryRunId + approvalUrl. Requires CREW_AGENT_API_KEY.',
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
        platform: z.enum(['pumpfun', 'bags', 'zora', 'clanker', 'vibevibe', 'sui']).optional(),
        ...forbiddenSecretFields,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
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
        'Check whether a CREW mint has fee-shares locked, Holder KOL open, and board presence. New launches lock fees at launch. Use after submit, or before repair (crew_wire_fees) / lock / crank.',
      inputSchema: {
        mint: mintSchema.describe(
          'Required. Solana mint (base58, 32–64 chars). Example: from crew_list_launches or crew_launch.',
        ),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
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
      description: [
        'Create and permanently lock Pump.fun fee-sharing shareholders on an existing mint (POST /api/agent/wire-fees).',
        'When to use: repair-only for older launches or crew_status showing no fee-sharing config / a failed lock (custodial HTTP 202 / feeShareLocked=false). Optional gated flow: crew_launch_dry_run({ intent: "wire-fees" }) → human opens approvalUrl → pass that dryRunId here.',
        'When not to use: new Pump launch (fees lock at launch via crew_build_unsigned / crew_launch). Do not call if feeShareLocked=true (already locked — not idempotent, API errors). Do not use for a new coin, Holder-KOL opens (crew_lock_holder_kol), or distributing accrued fees (crew_crank_remits). Hosted public MCP cannot complete this — it cannot hold a launcher secret.',
        'Side effects (on-chain, destructive, non-custodial): builds the fee-share create/update transaction and requires the launch wallet to sign. Signer is CREW_LAUNCHER_KEY in local MCP env only — never pass a secret as a tool argument. CrewPay does not custody keys or funds. Writes the Pump.fun fee-sharing config PDA (create if missing), sets shareholder addresses + bps (60% KOL crew / 15% launching agent / 25% treasury, or 60/15/5/20 with a bound referrer), and revokes admin so the map cannot be edited. Also persists feeShareLocked on the CrewPay board. Does not transfer SOL, move LP, or launch a mint.',
        'Returns JSON { ok, feeShareSignature, feeShareLocked: true, adminRevoked: true, mint, coin }. Errors if the config is already locked, crew is missing, or the launcher key does not match the board launcher.',
        'Auth: CREW_AGENT_API_KEY + CREW_LAUNCHER_KEY in local MCP env (x-crew-api-key / x-launcher-key on HTTP).',
      ].join(' '),
      inputSchema: {
        mint: mintSchema.describe(
          'Required. Solana Pump.fun mint (base58, 32–64 chars, no 0/O/I/l). Example: a mint from crew_list_launches or the crew_launch response.',
        ),
        dryRunId: z
          .string()
          .min(16)
          .max(64)
          .optional()
          .describe(
            'Optional string (16–64 chars) unless the API key has requireApproval=true. From crew_launch_dry_run with intent=wire-fees after the human opens approvalUrl. Example: a 32-char opaque id.',
          ),
        mode: z
          .enum(['agent', 'split', 'buyback', 'raid'])
          .optional()
          .describe('Optional desk mode. One of agent | split | buyback | raid. Default agent.'),
        name: z
          .string()
          .max(32)
          .optional()
          .describe('Optional coin name (≤32 chars) if the mint is not already on the board. Example: "Desk Cat".'),
        ticker: z
          .string()
          .max(13)
          .optional()
          .describe('Optional ticker (≤13 chars). Example: "DESK". Omit to reuse the board ticker.'),
        crew: z
          .array(crewMemberSchema)
          .min(1)
          .max(8)
          .optional()
          .describe(
            'Optional array of 1–8 crew members {handle, wallet, share, hireRole?}. Shares must total 100. Omit to reuse the crew stored on the board from launch.',
          ),
        ...forbiddenSecretFields,
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
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
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('Optional integer 1–100. Max launches to return. Example: 20. Default is the API default.'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
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
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
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
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
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
      description: [
        'Read the public CrewPay proof tape (GET /api/proof): fee-share-locked launches, creator-fee remits, and buyback runs.',
        'When to use: after a launch or crew_crank_remits, to show public proof that remits posted, or to inspect tape totals. No API key.',
        'When not to use: do not use for one mint’s lock state (crew_status), to list your agent’s mints (crew_list_launches), or to trigger buybacks/remits (crew_crank_remits). Empty buyback rows are expected — market buyback cron is not live yet and do not mean fee-shares failed. Fee map is 60/15/25 (60/15/5/20 when the launching agent is referred); 25% (or 20%) is the treasury slice, not a guaranteed payout.',
        'Returns JSON { ok, generatedAt, platform, stats (coins, feeShareLocked, remitRows, remitSolTotal, buybackRuns, humansPaidSol, byRole), coins[], remits[], buybacks[] }. Empty arrays mean no locked launches yet — not an error.',
        'Side effects: none. Read-only public GET. Does not change chain, board, or keys.',
      ].join(' '),
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe(
            'Optional integer 1–100 (default 40). Max tape rows for coins/remits/buybacks. Example: 20.',
          ),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
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
        'The launching agent earns 15% of creator fees onchain. Creator fees follow trading volume and can be zero. MAINNET custodial launch: Prefer explicit crew[] (from crew_list_kols). Autohire is a fallback convenience. Creates a Pump.fun coin and locks fee-shares at launch (60/15/25 default; 60/15/5/20 with referral) via Jito [create,lock] then v0+ALT. Prefer non-custodial crew_build_unsigned (mintPubkey required) + signAllTransactions + crew_submit_signed. Approval optional; requires CREW_AGENT_API_KEY + CREW_LAUNCHER_KEY. crew_wire_fees is repair-only.',
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
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
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
          tip: 'feeShareLocked=false (custodial lock failed) — repair-only: run crew_launch_dry_run with intent=wire-fees, open approvalUrl, then crew_wire_fees with that dryRunId. New launches lock fees at launch; do not treat wire as a normal step.',
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
              'Flow: crew_claim_key (if no key) → crew_discover → crew_list_kols (or crew_autohire fallback) → crew_build_unsigned (Pump: mintPubkey required; returns create+lock with signTogether / atomic-v0) → signAllTransactions → crew_submit_signed → crew_status → crew_crank_remits. Custodial alternate: crew_launch_dry_run → human opens approvalUrl → crew_launch(dryRunId) (fees locked at launch). crew_wire_fees is repair-only for older launches or a failed lock.',
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
