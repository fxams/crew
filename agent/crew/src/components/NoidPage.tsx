import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CREW_PUBLIC_API_URL, CREW_VERSION } from '../lib/config'
import {
  NOID_KIT_CARD,
  NOID_KIT_CONNECT,
  NOID_KIT_HEALTH,
  NOID_KIT_HTTP,
  NOID_KIT_REST,
  NOID_KIT_SITE,
  NOID_KIT_TOOLS,
  NOID_PUBLIC_NOTE,
} from '../lib/noid'

async function copyText(text: string) {
  await navigator.clipboard.writeText(text)
}

export function NoidPage() {
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
    <div className="app-shell page-agents page-noid">
      <section className="section section-agents-hero">
        <div className="agents-page-head">
          <div className="launch-page-head-row">
            <Link className="launch-back" to="/">
              ← Home
            </Link>
            <p className="section-label">NOID · v{CREW_VERSION}</p>
          </div>
          <motion.h1
            className="agents-brand"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            NOID Agent Kit
            <span>independent MCP.</span>
          </motion.h1>
          <p className="section-sub agents-hero-sub">{NOID_PUBLIC_NOTE}</p>
          <div className="agents-hero-actions">
            <a className="btn btn-primary" href={NOID_KIT_SITE} target="_blank" rel="noreferrer">
              Open trial
            </a>
            <Link className="btn btn-ghost" to="/agents">
              Agents
            </Link>
            <Link className="btn btn-ghost" to="/creative">
              Creative
            </Link>
          </div>
        </div>
      </section>

      <section className="section section-agents" aria-labelledby="noid-does-title">
        <p className="section-label">What agents can do</p>
        <h2 className="section-title" id="noid-does-title">
          Checkout, alerts, launch checklist.
        </h2>
        <p className="section-sub">
          Remote MCP at <a href={NOID_KIT_SITE}>{NOID_KIT_SITE.replace('https://', '')}</a>. Streamable
          HTTP at <code>/mcp</code>. REST under <code>/api/v1</code> (for example{' '}
          <code>POST /api/v1/quote</code>, Bearer required). Health:{' '}
          <a href={NOID_KIT_HEALTH}>
            <code>/health</code>
          </a>
          . Merchants get paid in NOID straight to their own <code>o1</code> address — the kit never
          holds keys or funds, and CrewPay never takes custody. Live NOID/USD quotes use CoinPaprika
          via the kit. The launch tool is a protocol checklist; it does not submit on-chain.
        </p>
        <ul className="noid-makes-list">
          <li>
            <strong>Checkout + receipts</strong>
            <span>create_invoice · check_invoice · verify_receipt — no custody</span>
          </li>
          <li>
            <strong>Alerts</strong>
            <span>whale moves · new tokens · watchlists</span>
          </li>
          <li>
            <strong>Launch kit</strong>
            <span>create_launch_kit — checklist from public docs, not an on-chain pad</span>
          </li>
        </ul>
      </section>

      <section className="section section-agents" aria-labelledby="noid-connect-title">
        <p className="section-label">Connect</p>
        <h2 className="section-title" id="noid-connect-title">
          Drop this into an MCP client.
        </h2>
        <p className="section-sub">
          Mint a trial key on the kit site (shown once). <code>initialize</code> and{' '}
          <code>tools/list</code> work without a key. <code>tools/call</code> needs{' '}
          <code>Authorization: Bearer nak_…</code>. Card:{' '}
          <a href={NOID_KIT_CARD} target="_blank" rel="noreferrer">
            server-card.json
          </a>
          . CrewPay pointer tool: <code>crew_noid</code>.
        </p>
        <div className="agents-fee-row" aria-label="NOID Agent Kit endpoints">
          <span>
            HTTP <a href={NOID_KIT_HTTP}>{NOID_KIT_HTTP}</a>
          </span>
          <span>
            REST <a href={NOID_KIT_REST}>{NOID_KIT_REST.replace('https://', '')}</a>
          </span>
          <span>
            Site <a href={NOID_KIT_SITE}>{NOID_KIT_SITE.replace('https://', '')}</a>
          </span>
        </div>
        <div className="agents-code-head">
          <span>Cursor / Claude mcpServers</span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void onCopy('mcp', NOID_KIT_CONNECT)}
          >
            {copied === 'mcp' ? 'Copied' : 'Copy config'}
          </button>
        </div>
        <pre className="agents-code">{NOID_KIT_CONNECT}</pre>
      </section>

      <section className="section section-agents" aria-labelledby="noid-tools-title">
        <p className="section-label">Tools</p>
        <h2 className="section-title" id="noid-tools-title">
          Catalog.
        </h2>
        <p className="section-sub">
          From live <code>tools/list</code> on the kit. Sixteen tools. Credits meter usage. Trial is
          50 credits. Top-ups in USDC on Base via <code>get_payment_info</code> then{' '}
          <code>claim_payment</code>.
        </p>
        <ul className="agents-model-list">
          {NOID_KIT_TOOLS.map((name) => (
            <li key={name}>
              <code>{name}</code>
            </li>
          ))}
        </ul>
      </section>

      <section className="section section-agents" aria-labelledby="noid-pricing-title">
        <p className="section-label">Trial + pricing</p>
        <h2 className="section-title" id="noid-pricing-title">
          50 credits, then USDC on Base.
        </h2>
        <p className="section-sub">
          1 credit = $0.01. The trial is enough for quotes, invoice checks, and light alerts — not a
          launch kit. After that, pay with USDC on Base (receive-only; the kit never holds a private
          key). Typical SKUs from the kit: verify/confirm about $0.05–$0.25; alerts $0.01–$0.05;
          launch kits $49–$149. Live NOID/USD pricing comes from CoinPaprika.
        </p>
      </section>

      <section className="section section-agents" aria-labelledby="noid-crewpay-title">
        <p className="section-label">On CrewPay</p>
        <h2 className="section-title" id="noid-crewpay-title">
          Catalog + optional read proxy.
        </h2>
        <p className="section-sub">
          The page and <code>GET /api/noid</code> are public. When operators turn the proxy on,
          agents can pull whale moves and new tokens through CrewPay using a server-side kit key.
          Off by default — nothing breaks if the key is unset. Connect to the kit directly for
          invoices, receipts, and spend.
        </p>
        <div className="agents-endpoint-list" role="list">
          <div className="agents-endpoint" role="listitem">
            <span className="agents-method">GET</span>
            <code>/api/noid</code>
            <span className="agents-auth">public</span>
            <p>Service card, tools, connect snippet</p>
          </div>
          <div className="agents-endpoint" role="listitem">
            <span className="agents-method">GET</span>
            <code>/api/noid/whale-moves</code>
            <span className="agents-auth">x-crew-api-key · flag off by default</span>
            <p>Read-only proxy of kit whale alerts</p>
          </div>
          <div className="agents-endpoint" role="listitem">
            <span className="agents-method">GET</span>
            <code>/api/noid/new-tokens</code>
            <span className="agents-auth">x-crew-api-key · flag off by default</span>
            <p>Read-only proxy of kit new native assets</p>
          </div>
        </div>
        <p className="hint">
          Discovery:{' '}
          <a href={`${CREW_PUBLIC_API_URL}/api/noid`}>{CREW_PUBLIC_API_URL}/api/noid</a>
        </p>
      </section>

      <footer className="footer">
        <div>CREW · NOID Agent Kit · v{CREW_VERSION}</div>
        <div>
          <Link to="/">Home</Link>
          {' · '}
          <Link to="/agents">Agents</Link>
          {' · '}
          <Link to="/creative">Creative</Link>
        </div>
      </footer>
    </div>
  )
}
