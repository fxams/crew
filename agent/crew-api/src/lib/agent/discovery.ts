/** Machine-readable discovery for frontier LLMs / tool-using agents. */

export const SITE_URL = 'https://crewpay.dev'
/** Canonical Agent API (custom domain). */
export const API_URL = 'https://api.crewpay.dev'
/** Render subdomain — kept as alias while DNS/certs propagate. */
export const API_URL_LEGACY = 'https://crewpay-api.onrender.com'

export const FRONTIER_MODELS = [
  'OpenAI GPT / ChatGPT / o-series',
  'Anthropic Claude',
  'Google Gemini',
  'xAI Grok',
  'Meta Llama',
  'DeepSeek',
  'Mistral',
  'Cursor Cloud / IDE agents',
  'MCP clients (Cursor, Claude Desktop, custom)',
  'Crypto / Solana / Pump.fun trading & launch agents',
  'Any tool-using agent with HTTP GET/POST',
] as const

/** Canonical MCP Streamable HTTP. */
export const MCP_HTTP_URL = 'https://mcp.crewpay.dev/mcp'
export const MCP_HTTP_URL_LEGACY = 'https://crewpay-mcp.onrender.com/mcp'
export const MCP_MANIFEST_URL = `${SITE_URL}/mcp.json`

/** Render injects RENDER_GIT_COMMIT; local/dev may set CREW_GIT_COMMIT. */
export function buildInfo() {
  const commit =
    process.env.RENDER_GIT_COMMIT?.trim() ||
    process.env.CREW_GIT_COMMIT?.trim() ||
    process.env.GIT_COMMIT?.trim() ||
    null
  const deployedAt =
    process.env.RENDER_DEPLOY_CREATED_AT?.trim() ||
    process.env.CREW_DEPLOYED_AT?.trim() ||
    null
  return {
    commit: commit ? commit.slice(0, 40) : null,
    commitShort: commit ? commit.slice(0, 12) : null,
    deployedAt,
    source: commit ? 'env' : 'unknown',
  }
}

export function agentDiscoveryJson() {
  const build = buildInfo()
  return {
    service: 'crew-agent-api',
    version: '1',
    build,
    name: 'CREW / CrewPay Agent Launch',
    description:
      'AI agents launch Pump.fun coins on Solana with on-chain fee-shares (60% KOL crew / 15% launching agent / 25% CrewPay). Buyback cron is not live yet — always dry-run first.',
    homepage: SITE_URL,
    api: API_URL,
    aliases: {
      api: [API_URL_LEGACY],
      mcp_http: [MCP_HTTP_URL_LEGACY],
      // app.crewpay.dev is optional and currently has no DNS — do not use as primary.
    },
    intended_clients: [...FRONTIER_MODELS],
    discovery: {
      llms_txt: `${API_URL}/llms.txt`,
      llms_full_txt: `${API_URL}/llms-full.txt`,
      openapi: `${API_URL}/openapi.json`,
      agent_card: `${API_URL}/.well-known/agent.json`,
      ai_plugin: `${API_URL}/.well-known/ai-plugin.json`,
      site_llms_txt: `${SITE_URL}/llms.txt`,
      site_openapi: `${SITE_URL}/openapi.json`,
      mcp_manifest: MCP_MANIFEST_URL,
      mcp_http: MCP_HTTP_URL,
      agents_md: `${SITE_URL}/AGENTS.md`,
      human_docs: `${SITE_URL}/agents`,
      proof: `${SITE_URL}/proof`,
      skill: `${SITE_URL}/AGENTS.md`,
    },
    mcp: {
      preferred_for: 'crypto / Solana / Pump.fun / KOL agents',
      http: MCP_HTTP_URL,
      http_legacy: MCP_HTTP_URL_LEGACY,
      manifest: MCP_MANIFEST_URL,
      package: 'crewpay-mcp',
      package_version: '1.2.3',
      package_install: 'npx -y crewpay-mcp@1.2.3',
      hosted: MCP_HTTP_URL,
      clawhub_skill: 'openclaw skills install @fxams/crewpay',
      official_mcp_registry: 'https://registry.modelcontextprotocol.io',
      official_mcp_registry_name: 'io.github.fxams/crewpay-mcp',
      clawpump_agent: 'https://clawpump.tech/agent/0d006dbb-3c21-4d14-b36b-3fcea74d0722',
      dry_run_store: 'postgres when DATABASE_URL set; in-memory only without DB (not multi-instance safe)',
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
      flow: 'crew_claim_key → crew_discover → crew_autohire → crew_launch_dry_run → crew_launch → crew_list_launches / crew_status / crew_wire_fees / crew_crank_remits',
    },
    proof: {
      http: `${API_URL}/api/proof`,
      buybacks: `${API_URL}/api/buybacks`,
      site: `${SITE_URL}/proof`,
    },
    webhooks: {
      events: [
        'launch.created',
        'feeShare.locked',
        'remit.cranked',
        'buyback.executed',
        'holderKol.locked',
      ],
      register: `${API_URL}/api/webhooks`,
    },
    topics: [
      'solana',
      'pump.fun',
      'meme-coin',
      'kol',
      'creator-fees',
      'fee-share',
      'crewpay',
      'autohire',
      'crypto-agent',
    ],
    auth: {
      headers: {
        'x-crew-api-key':
          'crew_ak_… from POST /api/agent/keys/claim (self-serve) or operator CREW_AGENT_API_KEY / POST /api/agent/keys. Browser VITE_CREW_API_KEY is rejected when the agent key is configured. MCP reads work without a key; writes require a key.',
        'x-launcher-key':
          'Agent Solana secret (base58 or JSON bytes). Required on launch/wire/lock. Optional on crank (permissionless — falls back to server CREW_OPS_KEY). Put it in MCP CREW_LAUNCHER_KEY env — never as a tool argument. Server CREW_AGENT_LAUNCHER_KEY only if CREW_ALLOW_SERVER_LAUNCHER=1.',
        'x-idempotency-key':
          'Optional 8–128 char key on POST /api/agent/launch — replays the same response for 15 minutes.',
      },
      keys: {
        claim: 'POST /api/agent/keys/claim (no auth, 5/hour/IP) → crew_ak_… once · default 5 launches/hour',
        mint: 'POST /api/agent/keys with an existing operator key → returns crew_ak_… once',
        list: 'GET /api/agent/keys',
        revoke: 'DELETE /api/agent/keys/:id',
      },
      rateLimits: {
        keyClaim: '5/hour per IP',
        autohire: '30/min per API key · 60/min per IP',
        dryRun: '60/min per API key · 120/min per IP',
        launch: '5/min per API key · 10/min per IP',
      },
    },
    limits: {
      name: '2–32 chars',
      ticker: '2–13 letters/numbers',
      description:
        '≤204 user chars (final on-chain ≤240 after “Launched from CrewPay.dev platform”)',
      initialBuySol: '0–10',
      crewSeats: '1–10',
      crewShares: 'must total 100% when crew[] is provided',
      cluster: 'mainnet-beta only (no devnet)',
    },
    endpoints: {
      'GET /api/agent': 'This discovery document',
      'POST /api/agent/autohire': {
        auth: 'x-crew-api-key',
        body: { name: 'string', ticker: 'string', description: 'string', seats: '1-10' },
        returns: 'Narrative hire plan + crew wallets + disclaimer (no on-chain tx)',
      },
      'POST /api/agent/launch/dry-run': {
        auth: 'x-crew-api-key',
        body: 'Same as launch (+ optional launcherPubkey for balance check)',
        returns: 'Planned crew, fee map, SOL estimate — no mint, no secret required',
      },
      'POST /api/agent/launch': {
        auth: 'x-crew-api-key + x-launcher-key',
        body: {
          name: 'required 2–32',
          ticker: 'required 2–13',
          description: 'optional ≤204 user chars (attribution appended → ≤240 final)',
          mode: 'split|buyback|raid|agent (default agent)',
          imageUrl: 'or imageBase64',
          twitter: 'optional',
          website: 'optional',
          autoHire: { seats: 5 },
          crew: 'optional explicit [{handle,wallet,share,hireRole}] shares=100%',
          agent: { name: '', objective: '', model: 'optional' },
          initialBuySol: '0–10',
          holderKol: false,
          atomicRequired:
            'optional bool — refuse sequential create→lock fallback (also CREW_ATOMIC_REQUIRED=1)',
        },
        returns:
          'mint, signatures, feeShareLocked, lockPath, createSlot/lockSlot, preLockCreatorFeesLamports, nextSteps, pumpUrl, crew, hirePlan (HTTP 201 locked / 202 partial)',
      },
      'GET /api/agent/status/:mint': {
        auth: 'x-crew-api-key',
        returns: 'feeShareLocked, holderKol, board coin, tip',
      },
      'GET /api/agent/launches': {
        auth: 'x-crew-api-key',
        query: { limit: '1–100' },
        returns: 'Launches for this agent key (operator env key sees recent board launches)',
      },
      'POST /api/agent/wire-fees': {
        auth: 'x-crew-api-key + x-launcher-key',
        body: { mint: 'required', mode: 'agent', crew: 'optional if board has crew (shares=100%)' },
        returns: 'feeShareSignature when repair/lock succeeds',
      },
      'POST /api/agent/lock-holder-kol': {
        auth: 'x-crew-api-key + x-launcher-key',
        body: { mint: 'required', mode: 'agent' },
        returns: 'Locks top holders ∩ KOL DB once (Pump admin revoked after)',
      },
      'POST /api/agent/crank': {
        auth: 'x-crew-api-key (+ optional x-launcher-key; else CREW_OPS_KEY)',
        body: { mint: 'required' },
        returns: 'sweep+distributeCreatorFeesV2 signature (permissionless payer)',
      },
      'POST /api/agent/keys/claim': {
        auth: 'none (rate-limited)',
        body: { label: 'optional', agentName: 'optional', model: 'optional' },
        returns: 'crew_ak_… shown once (default 5 launches/hour)',
      },
      'POST /api/agent/keys': {
        auth: 'x-crew-api-key',
        body: { label: 'string', launchesPerHour: 'optional' },
        returns: 'crew_ak_… shown once',
      },
      'GET /api/agent/keys': {
        auth: 'x-crew-api-key',
        returns: 'Active/revoked key metadata (no secrets)',
      },
      'DELETE /api/agent/keys/:id': {
        auth: 'x-crew-api-key',
        returns: 'Revokes key id',
      },
      'GET /api/proof': 'Public buyback + remit proof bundle',
      'GET /api/buybacks': 'Buyback run history',
      'GET /api/kols': 'Public KOL directory (query: q, limit)',
      'GET /api/kols/wallet/{wallet}': 'KOL by wallet',
      'GET /api/coins': 'Public recent launches',
      'GET /api/coins/{mint}': 'Coin by mint',
      'GET /api/board': 'Coins + remits board snapshot',
      'GET /api/remits': 'Public remits (query: mint, limit)',
      'POST /api/webhooks': 'Register agent webhook (auth)',
    },
    notes: [
      'MAINNET ONLY — use POST /api/agent/launch/dry-run (or MCP crew_launch_dry_run) before spending SOL.',
      'Self-serve auth: POST /api/agent/keys/claim → crew_ak_… then pass x-crew-api-key (no operator signup).',
      'Never put Solana secrets in LLM tool arguments — MCP rejects launcherKey/privateKey/secretKey tool args; use CREW_LAUNCHER_KEY env (local MCP) or REST x-launcher-key from your backend.',
      'Public hosted MCP (mcp.crewpay.dev) is publicMode: pass x-crew-api-key for writes; it cannot launch with your wallet.',
      'Launch prefers Jito bundle [create,lock] first (sendBundle encoding=base64, multi-region broadcast, getInflightBundleStatuses, tip via CREW_JITO_TIP_LAMPORTS default 0.001 SOL), then v0+ALT single-tx; sequential fallback is racy (~2s — see lockPath/createSlot/lockSlot/preLockCreatorFeesLamports + atomicFailures). Combined create+lock usually stays >1232 even with ALT (dynamic mint/curve accounts). Set CREW_LOOKUP_TABLE and/or atomicRequired / CREW_ATOMIC_REQUIRED=1 only after jito-bundle is reliable. HTTP 202 → crew_wire_fees({ mint }).',
      'Crank uses OnlinePumpSdk.buildDistributeCreatorFeesInstructions (sweep before distribute) — fixes CreatorFeesNotSwept 6095. Permissionless: x-launcher-key optional; server CREW_OPS_KEY pays when unset.',
      'coin.launchedAt is create-tx blockTime (ms) when RPC returns it; /api/proof may store truncated-to-second timestamps from DB.',
      `Build: commit=${build.commitShort || 'unknown'} deployedAt=${build.deployedAt || 'unknown'}.`,
      'Every launch description appends “Launched from CrewPay.dev platform” when missing (shown in dry-run.vibe / attribution).',
      'Dry-run validates images with the same PNG/JPEG/WebP/GIF magic-byte rules as a real launch (SVG rejected).',
      'Launcher wallet pays Pump create fees and becomes the on-chain creator.',
      'Every successful fee-share locks 25% creator fees to CREW_BUYBACK_WALLET (buybacks execute only when CREW_BUYBACK_MINT + CREW_BUYBACK_PRIVATE_KEY are set).',
      'Default mode=agent keeps 15% ops for the launcher and 60% hired KOLs.',
      'Autohire matches public Pump.fun profiles — not opt-in partners or endorsed affiliates; operators choose who receives fees.',
      'Prefer autoHire for narrative matching against the CREW 1500 KOL list; crew[] overrides (shares must total 100%).',
      'Always check feeShareLocked — HTTP 202 means mint live but fees not locked; call wire-fees or lock-holder-kol (see nextSteps).',
      'imageUrl is SSRF-guarded (public http(s) only; magic-byte image check).',
      'Start at GET /llms.txt or GET /api/agent — no browser required.',
      'Crypto agents: prefer MCP at https://mcp.crewpay.dev/mcp (discover → autohire → dry-run → launch → status/wire/crank).',
      'Public proof tape: GET /api/proof and https://crewpay.dev/proof — empty tape means no completed launches yet.',
      'Hourly Jupiter buyback cron runs when CREW_BUYBACK_MINT + CREW_BUYBACK_PRIVATE_KEY are set (CREW_BUYBACK_DRY_RUN=0 to execute).',
      `Legacy Render URLs still work: ${API_URL_LEGACY} · ${MCP_HTTP_URL_LEGACY}`,
    ],
  }
}

export function openApiSpec() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'CREW Agent Launch API',
      version: '1.0.0',
      summary: 'Launch Pump.fun coins with CREW fee-shares from any AI agent',
      description: [
        'CrewPay agent API for frontier LLMs and tool-using agents.',
        `Compatible with: ${FRONTIER_MODELS.join(', ')}.`,
        'Human desk: https://crewpay.dev — Agent discovery: GET /api/agent or /llms.txt',
      ].join('\n\n'),
      contact: { url: SITE_URL },
    },
    servers: [{ url: API_URL, description: 'Production' }],
    tags: [
      { name: 'discovery', description: 'Public machine-readable docs' },
      { name: 'agent', description: 'Autohire + launch' },
    ],
    paths: {
      '/llms.txt': {
        get: {
          tags: ['discovery'],
          summary: 'llms.txt index for AI crawlers',
          operationId: 'getLlmsTxt',
          responses: { '200': { description: 'text/plain llms.txt' } },
        },
      },
      '/llms-full.txt': {
        get: {
          tags: ['discovery'],
          summary: 'Full agent instructions',
          operationId: 'getLlmsFullTxt',
          responses: { '200': { description: 'text/plain full docs' } },
        },
      },
      '/openapi.json': {
        get: {
          tags: ['discovery'],
          summary: 'This OpenAPI document',
          operationId: 'getOpenApi',
          responses: { '200': { description: 'OpenAPI 3.1 JSON' } },
        },
      },
      '/api/agent': {
        get: {
          tags: ['discovery', 'agent'],
          summary: 'Agent capability discovery JSON',
          operationId: 'getAgentDiscovery',
          responses: {
            '200': {
              description: 'Discovery document',
              content: {
                'application/json': {
                  schema: { type: 'object', additionalProperties: true },
                },
              },
            },
          },
        },
      },
      '/api/agent/autohire': {
        post: {
          tags: ['agent'],
          summary: 'Preview narrative KOL autohire (no on-chain tx)',
          operationId: 'postAgentAutohire',
          security: [{ CrewApiKey: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AutohireRequest' },
              },
            },
          },
          responses: {
            '200': { description: 'Hire plan + crew wallets' },
            '401': { description: 'Missing/invalid API key' },
          },
        },
      },
      '/api/agent/launch/dry-run': {
        post: {
          tags: ['agent'],
          summary: 'Dry-run launch plan (no on-chain tx, mainnet costs estimated)',
          operationId: 'postAgentLaunchDryRun',
          security: [{ CrewApiKey: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/LaunchRequest' },
              },
            },
          },
          responses: {
            '200': { description: 'Validated plan + fee map + warnings' },
            '400': { description: 'Validation error' },
            '401': { description: 'Missing/invalid API key' },
          },
        },
      },
      '/api/agent/launch': {
        post: {
          tags: ['agent'],
          summary: 'Launch Pump coin with CREW fee-shares (mainnet)',
          operationId: 'postAgentLaunch',
          security: [{ CrewApiKey: [], LauncherKey: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/LaunchRequest' },
              },
            },
          },
          responses: {
            '201': { description: 'Mint created and fee-shares locked' },
            '202': { description: 'Mint live but feeShareLocked=false — wire fees' },
            '400': { description: 'Validation or launch error' },
            '401': { description: 'Missing/invalid auth' },
          },
        },
      },
      '/api/agent/keys/claim': {
        post: {
          tags: ['agent'],
          summary: 'Self-serve mint a crew_ak_… API key (no operator bootstrap)',
          operationId: 'postAgentKeysClaim',
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    label: { type: 'string', minLength: 2, maxLength: 64, default: 'agent' },
                    agentName: { type: 'string', maxLength: 48 },
                    model: { type: 'string', maxLength: 48 },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'crew_ak_… key shown once (default 5 launches/hour)' },
            '429': { description: 'IP claim rate limit (5/hour)' },
          },
        },
      },
      '/api/agent/keys': {
        get: {
          tags: ['agent'],
          summary: 'List agent API key metadata',
          operationId: 'getAgentKeys',
          security: [{ CrewApiKey: [] }],
          responses: {
            '200': { description: 'Key rows (no secrets)' },
            '401': { description: 'Missing/invalid API key' },
          },
        },
        post: {
          tags: ['agent'],
          summary: 'Mint a per-agent API key (bootstrap with operator key)',
          operationId: 'postAgentKeys',
          security: [{ CrewApiKey: [] }],
          responses: {
            '201': { description: 'crew_ak_… key shown once' },
            '401': { description: 'Missing/invalid API key' },
          },
        },
      },
      '/api/agent/keys/{id}': {
        delete: {
          tags: ['agent'],
          summary: 'Revoke an agent API key',
          operationId: 'deleteAgentKey',
          security: [{ CrewApiKey: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': { description: 'Revoked' },
            '404': { description: 'Not found' },
          },
        },
      },
      '/api/agent/status/{mint}': {
        get: {
          tags: ['agent'],
          summary: 'Mint fee-share / Holder KOL status',
          operationId: 'getAgentStatus',
          security: [{ CrewApiKey: [] }],
          parameters: [
            { name: 'mint', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Status' }, '401': { description: 'Unauthorized' } },
        },
      },
      '/api/agent/launches': {
        get: {
          tags: ['agent'],
          summary: 'List launches for this agent API key',
          operationId: 'getAgentLaunches',
          security: [{ CrewApiKey: [] }],
          parameters: [
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
            },
          ],
          responses: {
            '200': { description: 'Launches attributed to this key (or recent board for operator env key)' },
            '401': { description: 'Unauthorized' },
          },
        },
      },
      '/api/agent/wire-fees': {
        post: {
          tags: ['agent'],
          summary: 'Wire / repair CREW fee-shares on an existing mint (crew optional if board has crew)',
          operationId: 'postAgentWireFees',
          security: [{ CrewApiKey: [], LauncherKey: [] }],
          responses: {
            '201': { description: 'feeShareSignature' },
            '400': { description: 'Repair failed' },
          },
        },
      },
      '/api/agent/lock-holder-kol': {
        post: {
          tags: ['agent'],
          summary: 'Lock Holder-KOL fee-shares',
          operationId: 'postAgentLockHolderKol',
          security: [{ CrewApiKey: [], LauncherKey: [] }],
          responses: { '200': { description: 'Locked' }, '400': { description: 'Failed' } },
        },
      },
      '/api/agent/crank': {
        post: {
          tags: ['agent'],
          summary: 'Crank distributeCreatorFeesV2 remits (permissionless fee payer)',
          description:
            'x-launcher-key is optional. When omitted, the server uses CREW_OPS_KEY (or buyback key) as the fee payer.',
          operationId: 'postAgentCrank',
          security: [{ CrewApiKey: [] }, { CrewApiKey: [], LauncherKey: [] }],
          responses: { '200': { description: 'Remit signature' }, '400': { description: 'Failed' } },
        },
      },
      '/api/proof': {
        get: {
          tags: ['discovery'],
          summary: 'Public proof tape (launches, remits, buybacks)',
          operationId: 'getProof',
          parameters: [
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 200, default: 40 },
            },
          ],
          responses: { '200': { description: 'Proof bundle' } },
        },
      },
      '/api/kols': {
        get: {
          tags: ['discovery'],
          summary: 'Public KOL directory search',
          operationId: 'getKols',
          parameters: [
            { name: 'q', in: 'query', schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200 } },
          ],
          responses: { '200': { description: 'KOL rows' } },
        },
      },
      '/api/kols/wallet/{wallet}': {
        get: {
          tags: ['discovery'],
          summary: 'KOL by wallet',
          operationId: 'getKolByWallet',
          parameters: [
            { name: 'wallet', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'KOL row' }, '404': { description: 'Not found' } },
        },
      },
      '/api/coins': {
        get: {
          tags: ['discovery'],
          summary: 'Recent CREW launches',
          operationId: 'getCoins',
          responses: { '200': { description: 'Coin list' } },
        },
      },
      '/api/coins/{mint}': {
        get: {
          tags: ['discovery'],
          summary: 'Coin by mint',
          operationId: 'getCoin',
          parameters: [
            { name: 'mint', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Coin' }, '404': { description: 'Not found' } },
        },
      },
      '/api/board': {
        get: {
          tags: ['discovery'],
          summary: 'Board snapshot (coins + remits)',
          operationId: 'getBoard',
          responses: { '200': { description: 'Board' } },
        },
      },
      '/api/remits': {
        get: {
          tags: ['discovery'],
          summary: 'Public remits tape',
          operationId: 'getRemits',
          parameters: [
            { name: 'mint', in: 'query', schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200 } },
          ],
          responses: { '200': { description: 'Remits' } },
        },
      },
      '/api/buybacks': {
        get: {
          tags: ['discovery'],
          summary: 'Buyback run history',
          operationId: 'getBuybacks',
          responses: { '200': { description: 'Buyback runs' } },
        },
      },
      '/api/webhooks': {
        post: {
          tags: ['agent'],
          summary: 'Register webhook',
          operationId: 'postWebhooks',
          security: [{ CrewApiKey: [] }],
          responses: {
            '201': { description: 'Registered' },
            '401': { description: 'Unauthorized' },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        CrewApiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'x-crew-api-key',
          description: 'CREW_AGENT_API_KEY (server-only agent key)',
        },
        LauncherKey: {
          type: 'apiKey',
          in: 'header',
          name: 'x-launcher-key',
          description:
            'Agent Solana secret (base58 or JSON byte array). Required for launch/wire/lock; optional for crank when CREW_OPS_KEY is set.',
        },
      },
      schemas: {
        AutohireRequest: {
          type: 'object',
          properties: {
            name: { type: 'string', maxLength: 32 },
            ticker: { type: 'string', maxLength: 13 },
            description: {
              type: 'string',
              maxLength: 204,
              description:
                'User vibe ≤204. Final IPFS description appends “Launched from CrewPay.dev platform” (≤240).',
            },
            seats: { type: 'integer', minimum: 1, maximum: 10, default: 5 },
          },
        },
        CrewMember: {
          type: 'object',
          required: ['handle', 'wallet', 'share'],
          properties: {
            handle: { type: 'string' },
            wallet: { type: 'string' },
            share: { type: 'integer', minimum: 1, maximum: 100 },
            hireRole: {
              type: 'string',
              enum: ['caller', 'chart', 'raid', 'kol', 'dev'],
            },
          },
        },
        LaunchRequest: {
          type: 'object',
          required: ['name', 'ticker'],
          properties: {
            name: { type: 'string', minLength: 2, maxLength: 32 },
            ticker: { type: 'string', minLength: 2, maxLength: 13 },
            description: {
              type: 'string',
              maxLength: 204,
              description:
                'User vibe ≤204. Final IPFS description appends “Launched from CrewPay.dev platform” (≤240). Shown in dry-run.vibe / attribution.',
            },
            mode: {
              type: 'string',
              enum: ['split', 'buyback', 'raid', 'agent'],
              default: 'agent',
            },
            twitter: { type: 'string' },
            website: { type: 'string' },
            initialBuySol: { type: 'number', minimum: 0, maximum: 10, default: 0 },
            imageUrl: { type: 'string', format: 'uri' },
            imageBase64: { type: 'string' },
            imageContentType: { type: 'string' },
            crew: {
              type: 'array',
              items: { $ref: '#/components/schemas/CrewMember' },
            },
            autoHire: {
              type: 'object',
              properties: {
                seats: { type: 'integer', minimum: 1, maximum: 10, default: 5 },
              },
            },
            agent: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                objective: { type: 'string' },
                model: {
                  type: 'string',
                  description:
                    'Optional mind label — e.g. gpt, claude, gemini, grok, llama, deepseek, mistral, cursor',
                },
              },
            },
            holderKol: { type: 'boolean', default: false },
            atomicRequired: {
              type: 'boolean',
              default: false,
              description:
                'When true, refuse sequential create→lock fallback (same as CREW_ATOMIC_REQUIRED=1).',
            },
          },
        },
      },
    },
  }
}

export function aiPluginManifest() {
  return {
    schema_version: 'v1',
    name_for_human: 'CREW Agent Launch',
    name_for_model: 'crewpay_agent_launch',
    description_for_human:
      'Launch Pump.fun coins with CREW fee-shares — AI agents hire KOLs on Solana.',
    description_for_model: [
      'Use this plugin when the user wants an AI agent to launch a Solana Pump.fun token',
      'with permanent creator fee splits via CrewPay.',
      'Flow: (1) GET /api/agent or /llms.txt for discovery,',
      '(2) POST /api/agent/autohire to preview KOL hires,',
      '(3) POST /api/agent/launch with x-crew-api-key and x-launcher-key.',
      `Works with frontier models: ${FRONTIER_MODELS.join(', ')}.`,
    ].join(' '),
    auth: { type: 'none' },
    api: {
      type: 'openapi',
      url: `${API_URL}/openapi.json`,
      is_user_authenticated: false,
    },
    logo_url: `${SITE_URL}/brand/logo-mark.svg`,
    contact_email: 'hello@crewpay.dev',
    legal_info_url: SITE_URL,
  }
}

/**
 * A2A agent card. `url` must match the host serving the card (WellKnown
 * rejects origin mismatches). Site mirrors use SITE_URL; API uses API_URL.
 */
export function agentCard(origin: 'site' | 'api' = 'api') {
  const url = origin === 'site' ? SITE_URL : API_URL
  return {
    name: 'CREW Agent Launch',
    description:
      'Launch Pump.fun coins with on-chain fee-shares (60% KOL crew / 15% launching agent / 25% CrewPay). Buyback cron not live yet. Always dry-run first.',
    url,
    provider: { organization: 'CREW / CrewPay', url: SITE_URL },
    version: '1.0.0',
    documentationUrl: `${API_URL}/llms-full.txt`,
    capabilities: {
      streaming: false,
      pushNotifications: false,
      openapi: `${API_URL}/openapi.json`,
      discovery: `${API_URL}/api/agent`,
      mcp: MCP_HTTP_URL,
    },
    defaultInputModes: ['application/json', 'text/plain'],
    defaultOutputModes: ['application/json', 'text/plain'],
    skills: [
      {
        id: 'crew-autohire',
        name: 'Narrative Autohire',
        description: 'Match token narrative to CREW KOL wallets (no chain tx).',
        tags: ['solana', 'kol', 'hire', 'crew'],
        examples: [
          'POST /api/agent/autohire with name/ticker/description and seats',
        ],
      },
      {
        id: 'crew-launch',
        name: 'Launch with CrewPay',
        description:
          'Create Pump coin + lock fee-share (60% KOL / 15% agent / 25% CrewPay).',
        tags: ['solana', 'pump', 'launch', 'fee-share', 'crewpay'],
        examples: [
          'POST /api/agent/launch with imageUrl + autoHire + agent brief',
        ],
      },
      {
        id: 'crew-mcp',
        name: 'MCP tools',
        description:
          'Connect https://mcp.crewpay.dev/mcp or npx -y crewpay-mcp@1.2.3',
        tags: ['mcp', 'solana', 'crewpay'],
        examples: ['crew_claim_key → crew_discover → crew_autohire → crew_launch_dry_run'],
      },
    ],
    intended_clients: [...FRONTIER_MODELS],
  }
}

export function llmsTxt(): string {
  return `# CREW / CrewPay

> AI agents hire KOLs. Humans get paid. Launch Pump.fun coins with permanent on-chain fee splits via CrewPay.

## 3-call launch (start here)

1. \`POST ${API_URL}/api/agent/keys/claim\` → store \`crew_ak_…\` once
2. \`POST ${API_URL}/api/agent/autohire\` with \`x-crew-api-key\` + name/ticker/description → inspect crew
3. \`POST ${API_URL}/api/agent/launch\` with \`x-crew-api-key\` + \`x-launcher-key\` (+ optional \`crew[]\` / \`autoHire\`) → check \`feeShareLocked\`

MCP equivalent (pinned): \`npx -y crewpay-mcp@1.2.3\` then \`crew_claim_key\` → \`crew_autohire\` → \`crew_launch_dry_run\` → open approvalUrl → \`crew_launch\` with dryRunId (or hosted \`${MCP_HTTP_URL}\` for discover/autohire; launcher secret stays local).

ClawHub / OpenClaw skill: \`openclaw skills install @fxams/crewpay\` (https://clawhub.ai/fxams/crewpay).
Official MCP Registry: \`io.github.fxams/crewpay-mcp\` (https://registry.modelcontextprotocol.io).
ClawPump agent: https://clawpump.tech/agent/0d006dbb-3c21-4d14-b36b-3fcea74d0722.

This file is the discovery index for AI systems, including:
${FRONTIER_MODELS.map((m) => `- ${m}`).join('\n')}

If you can HTTP GET, start here — then call the API. No browser UI required.

## Canonical URLs

- Site: ${SITE_URL}
- API: ${API_URL}
- Agent discovery JSON: ${API_URL}/api/agent
- OpenAPI 3.1: ${API_URL}/openapi.json
- Full agent instructions: ${API_URL}/llms-full.txt
- Agent card: ${API_URL}/.well-known/agent.json
- AI plugin manifest: ${API_URL}/.well-known/ai-plugin.json
- Mirror on site: ${SITE_URL}/llms.txt · ${SITE_URL}/openapi.json · ${SITE_URL}/sitemap.xml
- MCP manifest: ${MCP_MANIFEST_URL}
- MCP HTTP (Streamable): ${MCP_HTTP_URL}
- MCP server card: https://mcp.crewpay.dev/.well-known/mcp.json
- Agents.md: ${SITE_URL}/AGENTS.md
- ClawHub skill: https://clawhub.ai/fxams/crewpay
- Official MCP Registry: https://registry.modelcontextprotocol.io (search \`crewpay\` / \`io.github.fxams/crewpay-mcp\`)
- ClawPump agent: https://clawpump.tech/agent/0d006dbb-3c21-4d14-b36b-3fcea74d0722
- Human docs: ${SITE_URL}/agents

## For crypto agents

If you launch **Solana / Pump.fun** coins, hire **KOLs**, or split **creator fees**, use CREW:

1. Prefer MCP tools: \`crew_claim_key\` → \`crew_discover\` → \`crew_autohire\` → \`crew_launch_dry_run\` → open approvalUrl → \`crew_launch\`(dryRunId) → \`crew_list_launches\` / \`crew_status\` / \`crew_wire_fees\` / \`crew_crank_remits\` (see ${MCP_MANIFEST_URL})
2. Or HTTP: GET ${API_URL}/api/agent → POST keys/claim → autohire → dry-run → open approvalUrl → launch with dryRunId → GET launches → POST /api/agent/crank
3. Keywords: solana, pump.fun, meme coin, KOL, fee-share, CrewPay, autohire

## Quick start for agents (full)

1. GET ${API_URL}/api/agent
2. POST ${API_URL}/api/agent/keys/claim  (no auth — or MCP \`crew_claim_key\` — store crew_ak_… once)
3. POST ${API_URL}/api/agent/autohire  (header: x-crew-api-key = crew_ak_…)
4. POST ${API_URL}/api/agent/launch/dry-run  (same key — no launcher secret, no SOL; returns dryRunId + approvalUrl)
5. **Open approvalUrl** in a browser and confirm (no confirm-phrase chat hacks)
6. POST ${API_URL}/api/agent/launch    (same body + dryRunId; headers: x-crew-api-key + x-launcher-key; atomic create+fee-lock + auto wire retry)
7. GET ${API_URL}/api/agent/launches   (your mints — scoped to crew_ak_…)
8. Optional: POST ${API_URL}/api/agent/crank  (body \`{ "mint" }\`; x-launcher-key optional when ops key set)
9. GET ${API_URL}/api/proof

## Auth

- \`x-crew-api-key\`: mint yourself via **POST /api/agent/keys/claim** (returns \`crew_ak_…\` once, 5/hour/IP) or use operator \`CREW_AGENT_API_KEY\` / POST /api/agent/keys.
- \`x-launcher-key\`: agent Solana secret (base58 or JSON byte array); signs create + fee-share; never logged. MCP: set CREW_LAUNCHER_KEY in env only (tool args are rejected). Hosted public MCP cannot take your wallet — run \`npx -y crewpay-mcp@1.2.3\` locally or call REST from your backend.
- \`x-idempotency-key\` (optional on launch): 8–128 chars; replays cached response for 15 minutes

## Description attribution

On-chain / IPFS descriptions append **Launched from CrewPay.dev platform** when missing. Send **≤204** characters so the final vibe stays ≤240. Dry-run returns the final \`vibe\` and \`attribution\` fields. Images must be PNG/JPEG/WebP/GIF (SVG rejected on dry-run and launch).

## Own wallet (local MCP)

Hosted MCP (\`mcp.crewpay.dev\`) is publicMode: pass \`x-crew-api-key\` for writes; it **cannot** hold your launcher secret. To launch with your own wallet:

1. \`npx -y crewpay-mcp@1.2.3\` (pin the version — do not use unpinned \`@latest\`)
2. Set \`CREW_AGENT_API_KEY\` + \`CREW_LAUNCHER_KEY\` (dedicated low-SOL burner) in MCP env (never tool args)
3. Or call REST \`POST /api/agent/launch\` from your backend with \`x-launcher-key\`

Canonical site is **https://crewpay.dev** (\`app.crewpay.dev\` has no DNS).

## Limits (site + API + MCP aligned)

- Name 2–32 · ticker 2–13 · description ≤204 user / ≤240 final · initialBuySol 0–10 · seats 1–10
- Crew shares must total 100% when \`crew[]\` is provided
- MAINNET only — dry-run does not spend SOL; real launch does
- Always check \`feeShareLocked\` (HTTP 201 locked / 202 mint-without-fees → wire-fees)
- \`imageUrl\` must be public http(s); private/link-local hosts are blocked

## Trust notes

- Autohire prefers **registered** KOLs when they match the narrative; otherwise public Pump profiles (listing ≠ consent)
- **Buyback status:** every launch locks **25% creator fees** to the CrewPay treasury wallet. Automatic market buybacks of a CREW token are **not live yet** (only when operators set buyback mint + key). Empty proof tape ≠ broken fee-shares.
- **Always dry-run** before any launch that spends SOL. **No price talk / ROI promises.**

## Fee map (mode=agent)

- **60%** hired KOL crew
- **15%** launching agent
- **25%** CrewPay treasury (buyback cron not live yet)

## Optional docs

- ${API_URL}/llms-full.txt: complete request/response examples
- ${SITE_URL}/: human desk (Phantom)
- ClawHub: \`openclaw skills install @fxams/crewpay\`
- Official MCP Registry: https://registry.modelcontextprotocol.io (search \`crewpay\`)
- ClawPump: https://clawpump.tech/agent/0d006dbb-3c21-4d14-b36b-3fcea74d0722
`
}

export function llmsFullTxt(): string {
  return `# CREW Agent Launch — full instructions

For: ${FRONTIER_MODELS.join('; ')}.

## What this is

CrewPay lets an AI agent launch a Solana Pump.fun coin and permanently split creator fees (**60% KOL crew / 15% launching agent / 25% CrewPay**) — without using the browser desk. Buyback cron is not live yet. Always dry-run first; no price talk.

Base URL: ${API_URL}
Human site: ${SITE_URL}

## Discovery (public, no auth)

\`\`\`
GET ${API_URL}/
GET ${API_URL}/api/agent
GET ${API_URL}/llms.txt
GET ${API_URL}/llms-full.txt
GET ${API_URL}/openapi.json
GET ${API_URL}/.well-known/agent.json
GET ${API_URL}/.well-known/ai-plugin.json
\`\`\`

Site mirrors (same content for crawlers hitting the marketing domain):

\`\`\`
GET ${SITE_URL}/llms.txt
GET ${SITE_URL}/llms-full.txt
GET ${SITE_URL}/openapi.json
GET ${SITE_URL}/.well-known/agent.json
GET ${SITE_URL}/.well-known/ai-plugin.json
GET ${SITE_URL}/robots.txt
\`\`\`

## Auth headers

| Header | Required | Purpose |
|--------|----------|---------|
| x-crew-api-key | yes (writes) | \`crew_ak_…\` from POST /api/agent/keys/claim (self-serve) or operator CREW_AGENT_API_KEY |
| x-launcher-key | launch / wire / lock (optional on crank) | Agent wallet secret (base58 or JSON byte array). Crank is permissionless — omit and server uses CREW_OPS_KEY when set. |
| x-idempotency-key | optional | Prevents duplicate launches on retry |

Self-serve key mint (no operator):

\`\`\`http
POST ${API_URL}/api/agent/keys/claim
Content-Type: application/json

{ "label": "agent", "agentName": "DeskBot", "model": "claude" }
\`\`\`

Returns \`crew_ak_…\` once (5 claims/hour/IP, default 5 launches/hour). Never echo or log x-launcher-key. Check \`feeShareLocked\` on every launch response. Launch prefers atomic create+fee-lock + auto wire retry; HTTP 202 → \`crew_wire_fees({ mint })\` (crew optional). List your mints via GET /api/agent/launches or MCP \`crew_list_launches\`.

## Description attribution

Every launch appends **Launched from CrewPay.dev platform** when missing. Keep the user \`description\` ≤**204** characters so the final on-chain vibe is ≤240. Dry-run returns \`vibe\` (final) and \`attribution\`.

## Own wallet / local MCP

- Hosted MCP \`https://mcp.crewpay.dev/mcp\` is **publicMode**: pass \`x-crew-api-key\`; it cannot use your launcher secret.
- Local package (pinned): \`npx -y crewpay-mcp@1.2.3\` with env \`CREW_AGENT_API_KEY\` + \`CREW_LAUNCHER_KEY\` (never tool args).
- ClawHub skill: \`openclaw skills install @fxams/crewpay\`
- Or REST from your backend with \`x-launcher-key\`. Site: **https://crewpay.dev** only (\`app.crewpay.dev\` has no DNS).
- Crank remits: \`POST /api/agent/crank\` with body \`{ "mint" }\` (MCP tool name remains \`crew_crank_remits\`).

## 1) Preview Autohire

\`\`\`http
POST ${API_URL}/api/agent/autohire
Content-Type: application/json
x-crew-api-key: $CREW_AGENT_API_KEY

{
  "name": "Desk Cat",
  "ticker": "DCAT",
  "description": "ai agent hires kols for a trench meme",
  "seats": 5
}
\`\`\`

Returns \`{ ok, match, hires, crew }\` — no on-chain transaction.

## 2) Launch

\`\`\`http
POST ${API_URL}/api/agent/launch
Content-Type: application/json
x-crew-api-key: $CREW_AGENT_API_KEY
x-launcher-key: $AGENT_SOLANA_SECRET
x-idempotency-key: unique-client-retry-key

{
  "name": "Desk Cat",
  "ticker": "DCAT",
  "description": "ai agent hires kols",
  "mode": "agent",
  "imageUrl": "https://example.com/cat.png",
  "autoHire": { "seats": 5 },
  "agent": {
    "name": "DeskBot",
    "objective": "Hire KOLs and grow DCAT on CREW",
    "model": "claude"
  },
  "initialBuySol": 0
}
\`\`\`

\`agent.model\` is a free-form label — use values like \`gpt\`, \`claude\`, \`gemini\`, \`grok\`, \`llama\`, \`deepseek\`, \`mistral\`, \`cursor\`, etc.

Success: HTTP 201 with \`mint\`, \`signature\`, \`feeShareSignature\`, \`pumpUrl\`, \`crew\` (with \`effectiveBps\`), \`shareholders\`, \`hirePlan\` (null when explicit crew[]), \`lockPath\`, \`createSlot\`/\`lockSlot\`, \`preLockCreatorFeesLamports\` (sequential only). Optional body \`atomicRequired: true\` refuses sequential fallback. \`GET /api/agent\` exposes \`build.commit\` so clients can confirm the deploy.

## 0) Dry-run (recommended)

\`\`\`http
POST ${API_URL}/api/agent/launch/dry-run
Content-Type: application/json
x-crew-api-key: $CREW_AGENT_API_KEY

{ same body as launch; optional "launcherPubkey": "<public address>" }
\`\`\`

Returns planned crew, fee map, SOL estimate, warnings — **no mint, no secret required**.

## Rules agents must follow

- Provide \`imageUrl\` or \`imageBase64\` (PNG/JPEG/WebP/GIF magic bytes; SVG rejected)
- Provide \`crew[]\` or \`autoHire\` (or \`holderKol: true\`)
- When \`crew[]\` is set, shares must total **100%**
- Keep \`description\` ≤204 chars (attribution makes final ≤240)
- Launcher wallet pays Pump create fees and is the on-chain creator
- Prefer \`autoHire\` unless the user named specific wallets — Autohire ≠ consent
- Mint a key via crew_claim_key or POST /api/agent/keys/claim (do not invent keys)
- Never put Solana secrets in tool arguments / prompts — MCP env only (\`launcherKey\`/\`privateKey\`/\`secretKey\` args are rejected)
- Prefer dry-run before launch; cluster is **mainnet-beta** only
- Treat HTTP 202 / feeShareLocked=false as incomplete — follow \`nextSteps\` / wire fees before celebrating
- Prefer atomic create+fee-lock; if a warning says follow-up fee lock, snipers may have skimmed early fees

## Related human product

Desk UI: ${SITE_URL}
Product brief: see repository PRODUCT.md (Agent API section)
`
}

export function robotsTxt(): string {
  return `# CREW — allow AI crawlers to read agent discovery docs
User-agent: *
Allow: /

# Explicit allow for major AI crawlers / frontier LLM bots
User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: Claude-Web
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Googlebot
Allow: /

User-agent: Gemini-Deep-Research
Allow: /

User-agent: Grok
Allow: /

User-agent: xAI
Allow: /

User-agent: Bytespider
Allow: /

User-agent: CCBot
Allow: /

User-agent: meta-externalagent
Allow: /

User-agent: FacebookBot
Allow: /

User-agent: Amazonbot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: YouBot
Allow: /

# llmstxt.org style pointer
# Llms-Txt: ${SITE_URL}/llms.txt
Sitemap: ${SITE_URL}/sitemap.xml
`
}
