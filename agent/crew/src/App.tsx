import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  DEFAULT_DRAFT,
  DESK_MODES,
  FEED,
  TAPE,
  normalizeTicker,
  totalShare,
  type CrewMember,
  type FeedItem,
  type LaunchDraft,
  type TapeItem,
} from "./data";
import { launchCrewToken, type LaunchResult } from "./lib/launch";

const MAX_CREW = 5;

export default function App() {
  const [draft, setDraft] = useState<LaunchDraft>(DEFAULT_DRAFT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LaunchResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [feed, setFeed] = useState<FeedItem[]>(FEED);
  const [tapeItems, setTapeItems] = useState<TapeItem[]>(TAPE);

  const shareTotal = useMemo(() => totalShare(draft.crew), [draft.crew]);
  const modeMeta = DESK_MODES.find((mode) => mode.id === draft.mode)!;
  const allocOk = shareTotal === 100;

  function updateCrew(index: number, patch: Partial<CrewMember>) {
    setDraft((prev) => ({
      ...prev,
      crew: prev.crew.map((member, i) => (i === index ? { ...member, ...patch } : member)),
    }));
  }

  function addCrew() {
    setDraft((prev) => {
      if (prev.crew.length >= MAX_CREW) return prev;
      return { ...prev, crew: [...prev.crew, { handle: "@", share: 0 }] };
    });
  }

  function removeCrew(index: number) {
    setDraft((prev) => {
      if (prev.crew.length <= 1) return prev;
      return { ...prev, crew: prev.crew.filter((_, i) => i !== index) };
    });
  }

  async function onLaunch() {
    setBusy(true);
    setError(null);
    setResult(null);
    setCopied(false);
    const response = await launchCrewToken(draft);
    setBusy(false);
    if (!response.ok) {
      setError(response.error);
      return;
    }
    setResult(response);
    setDraft((prev) => ({ ...prev, crew: response.crew }));

    const ticker = draft.ticker || "COIN";
    const modeLabel = DESK_MODES.find((m) => m.id === response.mode)?.label ?? response.mode;
    setFeed((prev) =>
      [
        {
          id: `launch_${response.mint.slice(0, 8)}`,
          time: "now",
          title: `$${ticker} crew locked`,
          detail: `${response.crew.map((m) => `${m.handle} ${m.share}%`).join(" · ")} · ${modeLabel}`,
          amount: "LIVE",
        },
        ...prev,
      ].slice(0, 24),
    );
    setTapeItems((prev) =>
      [
        ...response.crew.map((member, i) => ({
          id: `t_${response.mint.slice(0, 6)}_${i}`,
          text: `paid ${member.handle} · ${member.share}% of $${ticker}`,
        })),
        ...prev,
      ].slice(0, 24),
    );
  }

  async function copyMint() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.mint);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  const tape = [...tapeItems, ...tapeItems];

  return (
    <div className="site">
      <div className="noise" aria-hidden />

      <header className="nav-shell">
        <div className="app-shell nav">
          <a className="brand" href="#top">
            <span className="brand-mark">C</span>
            CREW
          </a>
          <nav className="nav-links">
            <a href="#board">Tape</a>
            <a className="btn btn-primary btn-nav" href="#launch">
              Launch
            </a>
          </nav>
        </div>
      </header>

      <div className="app-shell">
        <main id="top">
          <section className="hero">
            <div className="hero-visual" aria-hidden="true">
              <div className="hero-wave" />
            </div>
            <div className="hero-copy-wrap">
              <p className="section-label">Pump.fun fee desk</p>
              <motion.h1
                className="hero-brand"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              >
                CREW
                <span>gets paid.</span>
              </motion.h1>
              <p className="hero-copy">
                Tag up to five X handles. Lock a permanent fee split. Watch remits
                on the tape. <em>0% platform cut.</em>
              </p>
              <div className="hero-actions">
                <a className="btn btn-primary" href="#launch">
                  Launch coin
                </a>
                <a className="btn btn-ghost" href="#board">
                  Watch tape
                </a>
              </div>
            </div>
          </section>
        </main>
      </div>

      <div className="tape" aria-label="Live desk tape">
        <div className="tape-track">
          {tape.map((item, index) => (
            <div className="tape-item" key={`${item.id}-${index}`}>
              <strong>TAPE</strong> · {item.text}
            </div>
          ))}
        </div>
      </div>

      <div className="app-shell">
        <section className="section section-tight" id="how">
          <div className="steps">
            <article className="step">
              <div className="step-num">01</div>
              <h3>Name it</h3>
              <p>Ticker + vibe. Optional tiny buy.</p>
            </article>
            <article className="step">
              <div className="step-num">02</div>
              <h3>Tag crew</h3>
              <p>1–5 X handles. 100% split.</p>
            </article>
            <article className="step">
              <div className="step-num">03</div>
              <h3>Get paid</h3>
              <p>Fees → split → public tape.</p>
            </article>
          </div>
        </section>

        <section className="section" id="board">
          <div className="section-head-row">
            <div>
              <p className="section-label">Desk board</p>
              <h2 className="section-title">Money on the tape.</h2>
            </div>
            <div className="stat-strip" aria-label="Desk stats">
              <span>
                <strong>0%</strong> cut
              </span>
              <span>
                <strong>5</strong> crew
              </span>
              <span>
                <strong>3</strong> modes
              </span>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Live remits</h3>
              <span className="live-dot">live</span>
            </div>
            <div className="feed">
              {feed.map((item, index) => (
                <motion.div
                  className="feed-row"
                  key={item.id}
                  initial={{ opacity: 0, y: 6 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: Math.min(index, 6) * 0.03 }}
                >
                  <div className="feed-time">
                    {item.time === "now" ? "now" : `${item.time}`}
                  </div>
                  <div className="feed-main">
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                  </div>
                  <div className="feed-amt">{item.amount}</div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section className="section" id="launch">
          <p className="section-label">Launch desk</p>
          <h2 className="section-title">Ship a crew coin.</h2>
          <p className="section-sub">
            Demo mint validates a 100% crew split. Mainnet = Pump SDK + wallet.
          </p>

          <div className="launch">
            <div className="panel form">
              <div className="row-2">
                <div className="field">
                  <label htmlFor="name">Name</label>
                  <input
                    id="name"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder="Desk Cat"
                    autoComplete="off"
                  />
                </div>
                <div className="field">
                  <label htmlFor="ticker">Ticker</label>
                  <input
                    id="ticker"
                    value={draft.ticker}
                    onChange={(e) =>
                      setDraft({ ...draft, ticker: normalizeTicker(e.target.value) })
                    }
                    placeholder="DCAT"
                    autoComplete="off"
                    inputMode="text"
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="vibe">Vibe</label>
                <input
                  id="vibe"
                  value={draft.vibe}
                  onChange={(e) => setDraft({ ...draft, vibe: e.target.value })}
                  placeholder="Who gets paid and why?"
                  autoComplete="off"
                />
              </div>

              <div className="field">
                <label>Mode</label>
                <div className="mode-grid" role="radiogroup" aria-label="Desk mode">
                  {DESK_MODES.map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      role="radio"
                      aria-checked={draft.mode === mode.id}
                      className={`mode-option${draft.mode === mode.id ? " active" : ""}`}
                      onClick={() => setDraft({ ...draft, mode: mode.id })}
                    >
                      <strong className="mode-full">{mode.label}</strong>
                      <strong className="mode-short">{mode.short}</strong>
                    </button>
                  ))}
                </div>
                <p className="hint">{modeMeta.blurb}</p>
              </div>

              <div className="field">
                <label>Crew split</label>
                <div className="crew-list">
                  {draft.crew.map((member, index) => (
                    <div className="crew-row" key={`crew-${index}`}>
                      <input
                        value={member.handle}
                        onChange={(e) => updateCrew(index, { handle: e.target.value })}
                        placeholder="@handle"
                        autoComplete="off"
                        spellCheck={false}
                        inputMode="text"
                      />
                      <input
                        className="pct-input"
                        type="number"
                        min={0}
                        max={100}
                        value={member.share}
                        onChange={(e) =>
                          updateCrew(index, { share: Number(e.target.value) })
                        }
                        placeholder="%"
                        inputMode="numeric"
                      />
                      <button
                        type="button"
                        className="btn-remove"
                        onClick={() => removeCrew(index)}
                        disabled={draft.crew.length <= 1}
                        aria-label="Remove"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <div className="alloc-row">
                  <button
                    className="btn btn-ghost btn-sm"
                    type="button"
                    onClick={addCrew}
                    disabled={draft.crew.length >= MAX_CREW}
                  >
                    + Handle
                  </button>
                  <div className="alloc-meter" aria-hidden>
                    <div
                      className={`alloc-fill${allocOk ? " is-ok" : ""}`}
                      style={{ width: `${Math.min(100, Math.max(0, shareTotal))}%` }}
                    />
                  </div>
                  <p className={`hint${allocOk ? " is-ok" : " is-bad"}`}>
                    {shareTotal}%
                  </p>
                </div>
              </div>

              <div className="field field-buy">
                <label htmlFor="buy">Initial buy (SOL)</label>
                <input
                  id="buy"
                  type="number"
                  min={0}
                  step={0.01}
                  value={draft.initialBuySol}
                  onChange={(e) =>
                    setDraft({ ...draft, initialBuySol: Number(e.target.value) })
                  }
                  inputMode="decimal"
                />
              </div>

              {error ? <p className="form-error">{error}</p> : null}

              <button
                className="btn btn-primary btn-wide desktop-launch"
                type="button"
                onClick={onLaunch}
                disabled={busy}
              >
                {busy ? "Routing…" : "Launch (demo)"}
              </button>
            </div>

            <div className="panel preview">
              <div className="preview-token">
                <div className="token-art" aria-hidden />
                <div>
                  <h3>
                    ${draft.ticker || "TICKER"} · {draft.name || "Untitled"}
                  </h3>
                  <p>{draft.vibe || "Add a vibe."}</p>
                </div>
              </div>

              <div>
                <p className="section-label fee-map-label">Fee map</p>
                <div className="split-bars">
                  {draft.crew.map((member, index) => (
                    <div className="split-bar" key={`split-${index}`}>
                      <div className="split-meta">
                        <span>{member.handle || "@?"}</span>
                        <span>{member.share || 0}%</span>
                      </div>
                      <div className="split-track">
                        <div
                          className="split-fill"
                          style={{
                            width: `${Math.min(100, Math.max(0, member.share || 0))}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <p className="hint">
                <strong style={{ color: "var(--ink)" }}>{modeMeta.label}</strong>
                {" · "}0% platform cut
              </p>

              {result ? (
                <motion.div
                  className="success"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <h4>Demo mint ready</h4>
                  <p>
                    <code>{result.mint}</code>
                  </p>
                  <div className="success-actions">
                    <button className="btn btn-ghost btn-sm" type="button" onClick={copyMint}>
                      {copied ? "Copied" : "Copy"}
                    </button>
                    <a
                      className="btn btn-primary btn-sm"
                      href={result.pumpUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      pump.fun
                    </a>
                    <a className="btn btn-ghost btn-sm" href="#board">
                      Tape
                    </a>
                  </div>
                </motion.div>
              ) : null}
            </div>
          </div>
        </section>

        <footer className="footer">
          <div>CREW · Pump.fun fee desks</div>
          <div>Agency + X-DESK inspired</div>
        </footer>
      </div>

      <div className="mobile-cta">
        <button
          className="btn btn-primary btn-wide"
          type="button"
          onClick={() => {
            const top = document.getElementById("launch")?.getBoundingClientRect().top ?? 999;
            if (top > 100 || top < -120) {
              document.getElementById("launch")?.scrollIntoView({ behavior: "smooth" });
              return;
            }
            void onLaunch();
          }}
          disabled={busy}
        >
          {busy ? "Routing…" : "Launch (demo)"}
        </button>
      </div>
    </div>
  );
}
