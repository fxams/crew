/** Machine-readable discovery for frontier LLMs / tool-using agents. */

export const SITE_URL = 'https://crewpay.dev'
export const API_URL = 'https://crewpay-api.onrender.com'

export const FRONTIER_MODELS = [
  'OpenAI GPT / ChatGPT / o-series',
  'Anthropic Claude',
  'Google Gemini',
  'xAI Grok',
  'Meta Llama',
  'DeepSeek',
  'Mistral',
  'Cursor Cloud / IDE agents',
  'Any tool-using agent with HTTP GET/POST',
] as const

export function agentDiscoveryJson() {
  return {
    service: 'crew-agent-api',
    version: '1',
    name: 'CREW / CrewPay Agent Launch',
    description:
      'AI agents launch Pump.fun coins on Solana with permanent CREW fee-shares (25% platform buyback + hired KOL wallets).',
    homepage: SITE_URL,
    api: API_URL,
    intended_clients: [...FRONTIER_MODELS],
    discovery: {
      llms_txt: `${API_URL}/llms.txt`,
      llms_full_txt: `${API_URL}/llms-full.txt`,
      openapi: `${API_URL}/openapi.json`,
      agent_card: `${API_URL}/.well-known/agent.json`,
      ai_plugin: `${API_URL}/.well-known/ai-plugin.json`,
      site_llms_txt: `${SITE_URL}/llms.txt`,
      site_openapi: `${SITE_URL}/openapi.json`,
    },
    auth: {
      headers: {
        'x-crew-api-key': 'Platform API key (CREW_API_KEY)',
        'x-launcher-key':
          'Agent Solana secret key (base58 or JSON byte array). Signs create + fee-share. Never logged. Optional if CREW_AGENT_LAUNCHER_KEY is set on the server.',
      },
    },
    endpoints: {
      'GET /api/agent': 'This discovery document',
      'POST /api/agent/autohire': {
        auth: 'x-crew-api-key',
        body: { name: 'string', ticker: 'string', description: 'string', seats: '1-10' },
        returns: 'Narrative hire plan + crew wallets (no on-chain tx)',
      },
      'POST /api/agent/launch': {
        auth: 'x-crew-api-key + x-launcher-key',
        body: {
          name: 'required',
          ticker: 'required',
          description: 'optional',
          mode: 'split|buyback|raid|agent (default agent)',
          imageUrl: 'or imageBase64',
          autoHire: { seats: 5 },
          crew: 'optional explicit [{handle,wallet,share,hireRole}]',
          agent: { name: '', objective: '', model: 'optional' },
          initialBuySol: 0,
          holderKol: false,
        },
        returns: 'mint, signatures, pumpUrl, crew, hirePlan',
      },
    },
    notes: [
      'Launcher wallet pays Pump create fees and becomes the on-chain creator.',
      'Every launch locks 25% creator fees to CREW_BUYBACK_WALLET.',
      'Default mode=agent keeps 15% ops for the launcher and 60% for hired KOLs.',
      'Prefer autoHire for narrative matching against the CREW 1500 KOL list.',
      'Start at GET /llms.txt or GET /api/agent — no browser required.',
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
      '/api/agent/launch': {
        post: {
          tags: ['agent'],
          summary: 'Launch Pump coin with CREW fee-shares',
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
            '201': { description: 'Mint created' },
            '400': { description: 'Validation or launch error' },
            '401': { description: 'Missing/invalid auth' },
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
          description: 'Platform CREW_API_KEY',
        },
        LauncherKey: {
          type: 'apiKey',
          in: 'header',
          name: 'x-launcher-key',
          description: 'Agent Solana secret (base58 or JSON byte array)',
        },
      },
      schemas: {
        AutohireRequest: {
          type: 'object',
          properties: {
            name: { type: 'string', maxLength: 32 },
            ticker: { type: 'string', maxLength: 13 },
            description: { type: 'string', maxLength: 240 },
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
            description: { type: 'string', maxLength: 240 },
            mode: {
              type: 'string',
              enum: ['split', 'buyback', 'raid', 'agent'],
              default: 'agent',
            },
            twitter: { type: 'string' },
            website: { type: 'string' },
            initialBuySol: { type: 'number', minimum: 0, maximum: 100, default: 0 },
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

export function agentCard() {
  return {
    name: 'CREW Agent Launch',
    description:
      'Launch Pump.fun coins with CREW fee-shares. Narrative Autohire against 1500 KOLs. 25% CREW buyback locked on every launch.',
    url: API_URL,
    provider: { organization: 'CREW / CrewPay', url: SITE_URL },
    version: '1.0.0',
    documentationUrl: `${API_URL}/llms-full.txt`,
    capabilities: {
      streaming: false,
      pushNotifications: false,
      openapi: `${API_URL}/openapi.json`,
      discovery: `${API_URL}/api/agent`,
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
          'Create Pump coin + lock fee-share (25% CREW buyback + KOL crew).',
        tags: ['solana', 'pump', 'launch', 'fee-share', 'crewpay'],
        examples: [
          'POST /api/agent/launch with imageUrl + autoHire + agent brief',
        ],
      },
    ],
    intended_clients: [...FRONTIER_MODELS],
  }
}

export function llmsTxt(): string {
  return `# CREW / CrewPay

> AI agents hire KOLs. Humans get paid. Launch Pump.fun coins with permanent on-chain fee splits via CrewPay.

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
- Mirror on site: ${SITE_URL}/llms.txt · ${SITE_URL}/openapi.json

## Quick start for agents

1. GET ${API_URL}/api/agent
2. POST ${API_URL}/api/agent/autohire  (header: x-crew-api-key)
3. POST ${API_URL}/api/agent/launch    (headers: x-crew-api-key + x-launcher-key)

## Auth

- \`x-crew-api-key\`: platform key (CREW_API_KEY)
- \`x-launcher-key\`: agent Solana secret (base58 or JSON byte array); signs create + fee-share; never logged

## Fee map (mode=agent)

- 25% CREW platform buyback (locked)
- 15% launcher ops
- 60% hired KOLs

## Optional docs

- ${API_URL}/llms-full.txt: complete request/response examples
- ${SITE_URL}/: human desk (Phantom)
`
}

export function llmsFullTxt(): string {
  return `# CREW Agent Launch — full instructions

For: ${FRONTIER_MODELS.join('; ')}.

## What this is

CrewPay lets an AI agent launch a Solana Pump.fun coin and permanently split creator fees to hired KOL wallets + a 25% CREW buyback cut — without using the browser desk.

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
| x-crew-api-key | yes (writes) | Platform CREW_API_KEY |
| x-launcher-key | launch | Agent wallet secret (base58 or JSON byte array) |

Never echo or log x-launcher-key.

## 1) Preview Autohire

\`\`\`http
POST ${API_URL}/api/agent/autohire
Content-Type: application/json
x-crew-api-key: $CREW_API_KEY

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
x-crew-api-key: $CREW_API_KEY
x-launcher-key: $AGENT_SOLANA_SECRET

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

Success: HTTP 201 with \`mint\`, \`signature\`, \`feeShareSignature\`, \`pumpUrl\`, \`crew\`, \`hirePlan\`.

## Rules agents must follow

- Provide \`imageUrl\` or \`imageBase64\`
- Provide \`crew[]\` or \`autoHire\` (or \`holderKol: true\`)
- Launcher wallet pays Pump create fees and is the on-chain creator
- Prefer \`autoHire\` unless the user named specific wallets
- Do not invent CREW_API_KEY — the operator must supply it

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
Sitemap: ${SITE_URL}/llms.txt
Sitemap: ${SITE_URL}/openapi.json
`
}
