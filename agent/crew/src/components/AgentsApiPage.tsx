import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  AGENT_API_CLIENTS,
  CREW_AGENT_API_URL,
  CREW_VERSION,
  PLATFORM_BUYBACK_BPS,
} from '../lib/config'

const DISCOVERY = [
  { label: 'llms.txt', path: '/llms.txt', note: 'llmstxt.org index' },
  { label: 'llms-full.txt', path: '/llms-full.txt', note: 'Full call instructions' },
  { label: 'OpenAPI', path: '/openapi.json', note: 'OpenAPI 3.1 schema' },
  { label: 'Agent JSON', path: '/api/agent', note: 'Capability discovery' },
  { label: 'Agent card', path: '/.well-known/agent.json', note: 'Skills + intents' },
  { label: 'AI plugin', path: '/.well-known/ai-plugin.json', note: 'Plugin manifest' },
] as const

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
    path: '/api/agent/launch',
    auth: 'x-crew-api-key + x-launcher-key',
    summary: 'Create Pump coin + lock CREW fee-shares',
  },
] as const

const LAUNCH_CURL = `curl -sS ${CREW_AGENT_API_URL}/api/agent/launch \\
  -H "content-type: application/json" \\
  -H "x-crew-api-key: $CREW_API_KEY" \\
  -H "x-launcher-key: $AGENT_SOLANA_SECRET" \\
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
          <p className="section-sub agents-hero-sub">
            Frontier LLMs launch Pump coins with permanent CREW fee-shares —{' '}
            {PLATFORM_BUYBACK_BPS / 100}% buyback locked, KOLs hired by narrative. No browser
            desk required.
          </p>
          <div className="agents-hero-actions">
            <a className="btn btn-primary" href={`${CREW_AGENT_API_URL}/llms.txt`} target="_blank" rel="noreferrer">
              Open llms.txt
            </a>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void onCopy('base', CREW_AGENT_API_URL)}
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
              <a href={`${CREW_AGENT_API_URL}${item.path}`} target="_blank" rel="noreferrer">
                <strong>{item.label}</strong>
                <span>{CREW_AGENT_API_URL}{item.path}</span>
              </a>
              <em>{item.note}</em>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => void onCopy(item.path, `${CREW_AGENT_API_URL}${item.path}`)}
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
          <a href="/openapi.json" target="_blank" rel="noreferrer">
            /openapi.json
          </a>
          {' · '}
          <a href="/.well-known/agent.json" target="_blank" rel="noreferrer">
            /.well-known/agent.json
          </a>
        </p>
      </section>

      <section className="section section-agents" aria-labelledby="agents-endpoints-title">
        <p className="section-label">Endpoints</p>
        <h2 className="section-title" id="agents-endpoints-title">
          Call surface.
        </h2>
        <p className="section-sub">
          Auth: platform <code>x-crew-api-key</code> plus the agent&apos;s Solana secret as{' '}
          <code>x-launcher-key</code> (never logged).
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
            <strong>25%</strong> CREW buyback
          </span>
          <span>
            <strong>15%</strong> launcher ops
          </span>
          <span>
            <strong>60%</strong> hired KOLs
          </span>
        </div>
      </section>

      <section className="section section-agents" aria-labelledby="agents-launch-title">
        <p className="section-label">Quick start</p>
        <h2 className="section-title" id="agents-launch-title">
          Launch from any mind.
        </h2>
        <p className="section-sub">
          Preview with <code>POST /api/agent/autohire</code>, then launch. Prefer{' '}
          <code>autoHire</code> for narrative matching against the CREW 1500 KOL list.
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
          <a href={`${CREW_AGENT_API_URL}/llms.txt`} target="_blank" rel="noreferrer">
            llms.txt
          </a>
        </div>
      </footer>
    </div>
  )
}
