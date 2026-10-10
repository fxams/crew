import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  AGENT_API_CLIENTS,
  CREW_MCP_HTTP_URL,
  CREW_PUBLIC_API_URL,
  CREW_VERSION,
  PLATFORM_BUYBACK_BPS,
} from '../lib/config'

const DISCOVERY = [
  { label: 'llms.txt', path: '/llms.txt', note: 'llmstxt.org index' },
  { label: 'llms-full.txt', path: '/llms-full.txt', note: 'Full call instructions' },
  { label: 'OpenAPI', path: '/openapi.json', note: 'OpenAPI 3.1 schema' },
  { label: 'Agent JSON', path: '/api/agent', note: 'Capability discovery' },
  { label: 'MCP manifest', path: '/mcp.json', note: 'MCP install for crypto agents' },
  { label: 'Agent card', path: '/.well-known/agent.json', note: 'Skills + intents' },
  { label: 'AI plugin', path: '/.well-known/ai-plugin.json', note: 'Plugin manifest' },
] as const

const MCP_HTTP = CREW_MCP_HTTP_URL
const MCP_CONFIG = `{
  "mcpServers": {
    "crewpay": {
      "command": "npx",
      "args": ["-y", "crewpay-mcp@1.2.2"],
      "env": {
        "CREW_AGENT_API_KEY": "YOUR_AGENT_KEY",
        "CREW_LAUNCHER_KEY": "YOUR_SOLANA_SECRET",
        "CREW_API_URL": "${CREW_PUBLIC_API_URL}"
      }
    }
  }
}`

const ENDPOINTS = [
  {
    method: 'GET',
    path: '/api/agent',
    auth: 'public',
    summary: 'Discovery document — start here',
  },
  {
    method: 'POST',
    path: '/api/agent/autohire',
    auth: 'x-crew-api-key',
    summary: 'Preview narrative KOL hires (no chain tx)',
  },
  {
    method: 'POST',
    path: '/api/agent/launch/dry-run',
    auth: 'x-crew-api-key',
    summary: 'Validate + plan launch (no SOL, no mint)',
  },
  {
    method: 'POST',
    path: '/api/agent/launch',
    auth: 'x-crew-api-key + x-launcher-key',
    summary: 'MAINNET create Pump coin + lock CREW fee-shares',
  },
  {
    method: 'GET',
    path: '/api/agent/status/:mint',
    auth: 'x-crew-api-key',
    summary: 'Fee-share / Holder-KOL status + tip',
  },
  {
    method: 'POST',
    path: '/api/agent/wire-fees',
    auth: 'x-crew-api-key + x-launcher-key',
    summary: 'Repair / lock fee-shares on an existing mint',
  },
  {
    method: 'POST',
    path: '/api/agent/lock-holder-kol',
    auth: 'x-crew-api-key + x-launcher-key',
    summary: 'Lock top holders ∩ KOL DB (one-shot)',
  },
  {
    method: 'POST',
    path: '/api/agent/crank',
    auth: 'x-crew-api-key + x-launcher-key',
    summary: 'Distribute creator fees on-chain',
  },
  {
    method: 'POST',
    path: '/api/agent/keys',
    auth: 'x-crew-api-key',
    summary: 'Mint a crew_ak_… agent key (bootstrap with operator key)',
  },
  {
    method: 'GET',
    path: '/api/proof',
    auth: 'public',
    summary: 'Buyback + remit proof tape',
  },
  {
    method: 'POST',
    path: '/api/webhooks',
    auth: 'x-crew-api-key',
    summary: 'Register launch / fee / buyback webhooks',
  },
] as const

const LAUNCH_CURL = `curl -sS ${CREW_PUBLIC_API_URL}/api/agent/launch \\
  -H "content-type: application/json" \\
  -H "x-crew-api-key: $CREW_AGENT_API_KEY" \\
  -H "x-launcher-key: $AGENT_SOLANA_SECRET" \\
  -H "x-idempotency-key: desk-cat-$(date +%s)" \\
  -d '{
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
    }
  }'`

const KEYS_CURL = `curl -sS ${CREW_PUBLIC_API_URL}/api/agent/keys \\
  -H "content-type: application/json" \\
  -H "x-crew-api-key: $CREW_AGENT_API_KEY" \\
  -d '{ "label": "partner-bot", "launchesPerHour": 5 }'`

const WEBHOOK_CURL = `curl -sS ${CREW_PUBLIC_API_URL}/api/webhooks \\
  -H "content-type: application/json" \\
  -H "x-crew-api-key: $CREW_AGENT_API_KEY" \\
  -d '{
    "url": "https://example.com/hooks/crew",
    "events": ["launch.created", "feeShare.locked", "buyback.executed"],
    "label": "ops"
  }'`

const DRY_RUN_CURL = `curl -sS ${CREW_PUBLIC_API_URL}/api/agent/launch/dry-run \\
  -H "content-type: application/json" \\
  -H "x-crew-api-key: $CREW_AGENT_API_KEY" \\
  -d '{
    "name": "Desk Cat",
    "ticker": "DCAT",
    "description": "ai agent trench meme",
    "mode": "agent",
    "imageUrl": "https://example.com/cat.png",
    "autoHire": { "seats": 3 },
    "agent": { "name": "DeskBot", "objective": "Hire KOLs and grow DCAT", "model": "claude" }
  }'`

async function copyText(text: string) {
  await navigator.clipboard.writeText(text)
}

export function AgentsApiPage() {
  const [copied, setCopied] = useState<string | null>(null)

  async function onCopy(id: string, text: string) {
    try {
      await copyText(text)
      setCopied(id)
      window.setTimeout(() => setCopied(null), 1600)
    } catch {
      setCopied(null)
    }
  }

  return (
    <div className="app-shell page-agents">
      <section className="section section-agents-hero" id="agents-api">
        <div className="agents-page-head">
          <div className="launch-page-head-row">
            <Link className="launch-back" to="/">
              ← Home
            </Link>
            <p className="section-label">Agent API · v{CREW_VERSION}</p>
          </div>
          <motion.h1
            className="agents-brand"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            CREW
            <span>for agents.</span>
          </motion.h1>
          <div className="agents-hero-actions">
            <Link className="btn btn-ghost btn-sm" to="/proof">
              Proof tape
            </Link>
            <a className="btn btn-ghost btn-sm" href="/mcp.json" target="_blank" rel="noreferrer">
              mcp.json
            </a>
          </div>
          <p className="section-sub agents-hero-sub">
            Frontier LLMs launch Pump coins with permanent on-chain fee-shares —{' '}
            {PLATFORM_BUYBACK_BPS / 100}% CrewPay treasury · 15% launcher · 60% hired KOLs.
            Buyback cron is not live yet. Dry-run returns dryRunId + approvalUrl — approve there,
            then launch. No browser desk required for the agent path.
          </p>
          <div className="agents-hero-actions">
            <a className="btn btn-primary" href={`${CREW_PUBLIC_API_URL}/llms.txt`} target="_blank" rel="noreferrer">
              Open llms.txt
            </a>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void onCopy('base', CREW_PUBLIC_API_URL)}
            >
              {copied === 'base' ? 'Copied' : 'Copy API base'}
            </button>
            <Link className="btn btn-ghost" to="/launch">
              Human desk
            </Link>
          </div>
        </div>
      </section>

      <section className="section section-agents" aria-labelledby="agents-discover-title">
        <p className="section-label">Discovery</p>
        <h2 className="section-title" id="agents-discover-title">
          How agents find CREW.
        </h2>
        <p className="section-sub">
          Point any tool-using model at the base URL — or drop <code>/llms.txt</code> into its
          system prompt. Same files ship on crewpay.dev for crawlers.
        </p>
        <ul className="agents-link-list">
          {DISCOVERY.map((item, index) => (
            <motion.li
              key={item.path}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: Math.min(index, 5) * 0.04 }}
            >
              <a href={`${CREW_PUBLIC_API_URL}${item.path}`} target="_blank" rel="noreferrer">
                <strong>{item.label}</strong>
                <span>
                  {CREW_PUBLIC_API_URL}
                  {item.path}
                </span>
              </a>
              <em>{item.note}</em>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => void onCopy(item.path, `${CREW_PUBLIC_API_URL}${item.path}`)}
              >
                {copied === item.path ? 'Copied' : 'Copy'}
              </button>
            </motion.li>
          ))}
        </ul>
        <p className="hint agents-mirror-hint">
          Site mirrors:{' '}
          <a href="/llms.txt" target="_blank" rel="noreferrer">
            /llms.txt
          </a>
          {' · '}
          <a href="/mcp.json" target="_blank" rel="noreferrer">
            /mcp.json
          </a>
          {' · '}
          <a href="/AGENTS.md" target="_blank" rel="noreferrer">
            /AGENTS.md
          </a>
          {' · '}
          <a href="/.well-known/agent.json" target="_blank" rel="noreferrer">
            /.well-known/agent.json
          </a>
        </p>
      </section>

      <section className="section section-agents" aria-labelledby="agents-mcp-title">
        <p className="section-label">MCP</p>
        <h2 className="section-title" id="agents-mcp-title">
          Native tools for crypto agents.
        </h2>
        <p className="section-sub">
          Cursor, Claude Desktop, and any MCP client get <code>crew_discover</code>,{' '}
          <code>crew_autohire</code>, <code>crew_launch_dry_run</code>, <code>crew_launch</code>,{' '}
          <code>crew_status</code>, <code>crew_wire_fees</code>, <code>crew_lock_holder_kol</code>,{' '}
          <code>crew_crank_remits</code>, and <code>crew_proof</code>. Secrets stay in MCP env —
          never as tool arguments.
        </p>
        <div className="agents-fee-row" aria-label="MCP endpoints">
          <span>
            HTTP <a href={MCP_HTTP}>{MCP_HTTP}</a>
          </span>
          <span>
            Manifest <a href="/mcp.json">/mcp.json</a>
          </span>
        </div>
        <div className="agents-code-head">
          <span>Cursor / Claude mcpServers</span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void onCopy('mcp', MCP_CONFIG)}
          >
            {copied === 'mcp' ? 'Copied' : 'Copy config'}
          </button>
        </div>
        <pre className="agents-code">{MCP_CONFIG}</pre>
      </section>

      <section className="section section-agents" aria-labelledby="agents-endpoints-title">
        <p className="section-label">Endpoints</p>
        <h2 className="section-title" id="agents-endpoints-title">
          Call surface.
        </h2>
        <p className="section-sub">
          Auth: operator supplies <code>CREW_AGENT_API_KEY</code> (or mint via{' '}
          <code>POST /api/agent/keys</code>). Launcher secret is <code>x-launcher-key</code> / MCP{' '}
          <code>CREW_LAUNCHER_KEY</code> only — never in prompts. Limits: name 2–32, ticker 2–13,
          initial buy 0–10 SOL. Prefer <code>dry-run</code> first; treat HTTP 202 as incomplete.
        </p>
        <div className="agents-endpoint-list" role="list">
          {ENDPOINTS.map((ep) => (
            <div className="agents-endpoint" role="listitem" key={ep.path + ep.method}>
              <span className="agents-method">{ep.method}</span>
              <code>{ep.path}</code>
              <span className="agents-auth">{ep.auth}</span>
              <p>{ep.summary}</p>
            </div>
          ))}
        </div>
        <div className="agents-fee-row" aria-label="Fee map">
          <span>
            <strong>60%</strong> hired KOLs
          </span>
          <span>
            <strong>15%</strong> launcher ops
          </span>
          <span>
            <strong>25%</strong> CrewPay treasury
            <em className="agents-fee-note"> (buyback cron not live yet)</em>
          </span>
        </div>
      </section>

      <section className="section section-agents" aria-labelledby="agents-launch-title">
        <p className="section-label">Quick start</p>
        <h2 className="section-title" id="agents-launch-title">
          Launch from any mind.
        </h2>
        <p className="section-sub">
          Preview with autohire + <code>launch/dry-run</code>, then launch. Autohire picks public
          Pump profiles by narrative — not opt-in partners. Prefer <code>autoHire</code> or an
          explicit <code>crew[]</code> whose shares total 100%.
        </p>
        <div className="agents-code-head">
          <span>POST /api/agent/launch</span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void onCopy('curl', LAUNCH_CURL)}
          >
            {copied === 'curl' ? 'Copied' : 'Copy curl'}
          </button>
        </div>
        <pre className="agents-code">{LAUNCH_CURL}</pre>
      </section>

      <section className="section section-agents" aria-labelledby="agents-ops-title">
        <p className="section-label">Operator</p>
        <h2 className="section-title" id="agents-ops-title">
          Keys, dry-run, webhooks.
        </h2>
        <p className="section-sub">
          Bootstrap with the Render <code>CREW_AGENT_API_KEY</code>, mint scoped{' '}
          <code>crew_ak_…</code> keys, rehearse launches without spending SOL, then register
          webhooks for launch / fee / buyback events.
        </p>
        <div className="agents-code-head">
          <span>POST /api/agent/launch/dry-run</span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void onCopy('dry', DRY_RUN_CURL)}
          >
            {copied === 'dry' ? 'Copied' : 'Copy'}
          </button>
        </div>
        <pre className="agents-code">{DRY_RUN_CURL}</pre>
        <div className="agents-code-head">
          <span>POST /api/agent/keys</span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void onCopy('keys', KEYS_CURL)}
          >
            {copied === 'keys' ? 'Copied' : 'Copy'}
          </button>
        </div>
        <pre className="agents-code">{KEYS_CURL}</pre>
        <div className="agents-code-head">
          <span>POST /api/webhooks</span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void onCopy('hook', WEBHOOK_CURL)}
          >
            {copied === 'hook' ? 'Copied' : 'Copy'}
          </button>
        </div>
        <pre className="agents-code">{WEBHOOK_CURL}</pre>
      </section>

      <section className="section section-agents section-agents-models" aria-labelledby="agents-models-title">
        <p className="section-label">Frontier LLMs</p>
        <h2 className="section-title" id="agents-models-title">
          Built for tool-users.
        </h2>
        <p className="section-sub">
          Documented for every major agent stack that can HTTP GET/POST — paste the discovery URL
          into the system prompt or tool list.
        </p>
        <ul className="agents-model-list">
          {AGENT_API_CLIENTS.map((name) => (
            <li key={name}>{name}</li>
          ))}
          <li>Any tool-using agent with HTTP GET/POST</li>
        </ul>
      </section>

      <footer className="footer">
        <div>CREW · Agent API · v{CREW_VERSION}</div>
        <div>
          <Link to="/">Home</Link>
          {" · "}
          <Link to="/launch">Launch desk</Link>
          {" · "}
          <a href={`${CREW_PUBLIC_API_URL}/llms.txt`} target="_blank" rel="noreferrer">
            llms.txt
          </a>
        </div>
      </footer>
    </div>
  )
}
