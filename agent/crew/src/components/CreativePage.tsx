import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CREW_PUBLIC_API_URL, CREW_VERSION } from '../lib/config'
import {
  CREATIVE_MCP_CARD,
  CREATIVE_MCP_CONNECT,
  CREATIVE_MCP_HTTP,
  CREATIVE_MCP_SITE,
  CREATIVE_MCP_TOOLS,
  CREATIVE_PUBLIC_NOTE,
  CREATIVE_STILL_KINDS,
} from '../lib/creative'

async function copyText(text: string) {
  await navigator.clipboard.writeText(text)
}

export function CreativePage() {
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
    <div className="app-shell page-agents page-creative">
      <section className="section section-agents-hero">
        <div className="agents-page-head">
          <div className="launch-page-head-row">
            <Link className="launch-back" to="/">
              ← Home
            </Link>
            <p className="section-label">Creative · v{CREW_VERSION}</p>
          </div>
          <motion.h1
            className="agents-brand"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            Creative
            <span>for launches.</span>
          </motion.h1>
          <p className="section-sub agents-hero-sub">{CREATIVE_PUBLIC_NOTE}</p>
          <div className="agents-hero-actions">
            <a className="btn btn-primary" href={CREATIVE_MCP_SITE} target="_blank" rel="noreferrer">
              Open trial
            </a>
            <Link className="btn btn-ghost" to="/coins">
              Coin pages
            </Link>
            <Link className="btn btn-ghost" to="/agents">
              Agents
            </Link>
            <Link className="btn btn-ghost" to="/noid">
              NOID
            </Link>
          </div>
        </div>
      </section>

      <section className="section section-agents" aria-labelledby="creative-makes-title">
        <p className="section-label">What it makes</p>
        <h2 className="section-title" id="creative-makes-title">
          Launch art, not escrow.
        </h2>
        <p className="section-sub">
          Remote MCP at <a href={CREATIVE_MCP_SITE}>{CREATIVE_MCP_SITE.replace('https://', '')}</a>.
          Streamable HTTP at <code>/mcp</code>. Stills (logo, banner, meme) run in one call. Kits,
          stickers, music, and teasers return a <code>job_id</code> — poll <code>get_job</code>.
          Human escrow jobs stay on <Link to="/jobs">Jobs</Link> / <code>post_coin_job</code>.
        </p>
        <ul className="creative-makes-list">
          <li>
            <strong>Stills</strong>
            <span>{CREATIVE_STILL_KINDS.join(' · ')}</span>
          </li>
          <li>
            <strong>Kits</strong>
            <span>logo options, wide banners, sticker packs</span>
          </li>
          <li>
            <strong>Motion</strong>
            <span>short teaser videos + music beds</span>
          </li>
        </ul>
      </section>

      <section className="section section-agents" aria-labelledby="creative-connect-title">
        <p className="section-label">Connect</p>
        <h2 className="section-title" id="creative-connect-title">
          Drop this into an MCP client.
        </h2>
        <p className="section-sub">
          Mint a trial key on the Creative site (shown once). <code>initialize</code> and{' '}
          <code>tools/list</code> work without a key. <code>tools/call</code> needs{' '}
          <code>Authorization: Bearer lk_…</code>. Card:{' '}
          <a href={CREATIVE_MCP_CARD} target="_blank" rel="noreferrer">
            server-card.json
          </a>
          . CrewPay pointer tool: <code>crew_creative</code>.
        </p>
        <div className="agents-fee-row" aria-label="Creative MCP endpoints">
          <span>
            HTTP <a href={CREATIVE_MCP_HTTP}>{CREATIVE_MCP_HTTP}</a>
          </span>
          <span>
            Site <a href={CREATIVE_MCP_SITE}>{CREATIVE_MCP_SITE.replace('https://', '')}</a>
          </span>
        </div>
        <div className="agents-code-head">
          <span>Cursor / Claude mcpServers</span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void onCopy('mcp', CREATIVE_MCP_CONNECT)}
          >
            {copied === 'mcp' ? 'Copied' : 'Copy config'}
          </button>
        </div>
        <pre className="agents-code">{CREATIVE_MCP_CONNECT}</pre>
      </section>

      <section className="section section-agents" aria-labelledby="creative-tools-title">
        <p className="section-label">Tools</p>
        <h2 className="section-title" id="creative-tools-title">
          Catalog.
        </h2>
        <p className="section-sub">
          From live <code>tools/list</code>. Credits meter usage. Trial is 50 credits. Top-ups in
          USDC on Base via <code>get_payment_info</code> then <code>claim_payment</code>.
        </p>
        <ul className="agents-model-list">
          {CREATIVE_MCP_TOOLS.map((name) => (
            <li key={name}>
              <code>{name}</code>
            </li>
          ))}
        </ul>
      </section>

      <section className="section section-agents" aria-labelledby="creative-crewpay-title">
        <p className="section-label">On CrewPay</p>
        <h2 className="section-title" id="creative-crewpay-title">
          Coin pages + API.
        </h2>
        <p className="section-sub">
          Every coin page links here. When operators turn generate on, agents can request a logo,
          banner, or meme for a CrewPay-launched mint. Off by default — nothing breaks if the key
          is unset.
        </p>
        <div className="agents-endpoint-list" role="list">
          <div className="agents-endpoint" role="listitem">
            <span className="agents-method">GET</span>
            <code>/api/creative</code>
            <span className="agents-auth">public</span>
            <p>Service card, tools, connect snippet</p>
          </div>
          <div className="agents-endpoint" role="listitem">
            <span className="agents-method">POST</span>
            <code>/api/coins/:mint/creative</code>
            <span className="agents-auth">x-crew-api-key · flag off by default</span>
            <p>kind=logo|banner|meme — CrewPay calls creative-mcp server-side</p>
          </div>
        </div>
        <p className="hint">
          Discovery: <a href={`${CREW_PUBLIC_API_URL}/api/creative`}>{CREW_PUBLIC_API_URL}/api/creative</a>
        </p>
      </section>

      <footer className="footer">
        <div>CREW · Creative · v{CREW_VERSION}</div>
        <div>
          <Link to="/">Home</Link>
          {' · '}
          <Link to="/agents">Agents</Link>
          {' · '}
          <Link to="/noid">NOID</Link>
          {' · '}
          <Link to="/coins">Coins</Link>
        </div>
      </footer>
    </div>
  )
}
