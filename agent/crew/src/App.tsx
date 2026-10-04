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
  const [feed, setFeed] = useState<FeedItem[]>(FEED);
  const [tapeItems, setTapeItems] = useState<TapeItem[]>(TAPE);

  const shareTotal = useMemo(() => totalShare(draft.crew), [draft.crew]);
  const modeMeta = DESK_MODES.find((mode) => mode.id === draft.mode)!;

  function updateCrew(index: number, patch: Partial<CrewMember>) {
    setDraft((prev) => ({
      ...prev,
      crew: prev.crew.map((member, i) => (i === index ? { ...member, ...patch } : member)),
    }));
  }

  function addCrew() {
    setDraft((prev) => {
      if (prev.crew.length >= MAX_CREW) return prev;
      return {
        ...prev,
        crew: [...prev.crew, { handle: "@", share: 0 }],
      };
    });
  }

  function removeCrew(index: number) {
    setDraft((prev) => {
      if (prev.crew.length <= 1) return prev;
      return {
        ...prev,
        crew: prev.crew.filter((_, i) => i !== index),
      };
    });
  }

  async function onLaunch() {
    setBusy(true);
    setError(null);
    setResult(null);
    const response = await launchCrewToken(draft);
    setBusy(false);
    if (!response.ok) {
      setError(response.error);
      return;
    }
    setResult(response);
    setDraft((prev) => ({ ...prev, crew: response.crew, ticker: prev.ticker.toUpperCase() }));

    const modeLabel = DESK_MODES.find((m) => m.id === response.mode)?.label ?? response.mode;
    const receipt: FeedItem = {
      id: `launch_${response.mint.slice(0, 8)}`,
      time: "now",
      title: `$${draft.ticker || "COIN"} crew locked`,
      detail: `${response.crew.map((m) => `${m.handle} ${m.share}%`).join(" · ")} · ${modeLabel} · 0% platform cut`,
      amount: "LIVE",
    };
    setFeed((prev) => [receipt, ...prev].slice(0, 24));

    const prints: TapeItem[] = response.crew.map((member, i) => ({
      id: `t_${response.mint.slice(0, 6)}_${i}`,
      text: `paid ${member.handle} · ${member.share}% of $${draft.ticker || "COIN"} · demo mint`,
    }));
    setTapeItems((prev) => [...prints, ...prev].slice(0, 24));
  }

  const tape = [...tapeItems, ...tapeItems];

  return (
    <div className="site">
      <div className="noise" aria-hidden />
      <div className="app-shell">
        <header className="nav">
          <a className="brand" href="#top">
            <span className="brand-mark">C</span>
            CREW
          </a>
          <nav className="nav-links">
            <a href="#how">How it works</a>
            <a href="#board">Desk board</a>
            <a href="#launch">Launch</a>
            <a className="btn btn-primary" href="#launch">
              Open desk
            </a>
          </nav>
        </header>

        <main id="top">
          <section className="hero">
            <motion.p
              className="section-label"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              Pump.fun × X fee desks
            </motion.p>
            <motion.h1
              className="hero-brand"
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            >
              CREW
              <span>gets paid.</span>
            </motion.h1>
            <motion.p
              className="hero-copy"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.55 }}
            >
              Launch a Pump coin, tag the X accounts behind it, and let the desk
              split creator fees automatically. No agency brain surgery. No
              stock circus. Just a clean crew cut CT can understand in one scroll.
            </motion.p>
            <motion.div
              className="hero-actions"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.28, duration: 0.5 }}
            >
              <a className="btn btn-primary" href="#launch">
                Launch with crew
              </a>
              <a className="btn btn-ghost" href="#board">
                Watch the tape
              </a>
            </motion.div>
          </section>
        </main>
      </div>

      <div className="tape" aria-label="Live desk tape">
        <div className="tape-track">
          {tape.map((item, index) => (
            <div className="tape-item" key={`${item.id}-${index}`}>
              <strong>CREW TAPE</strong> · {item.text}
            </div>
          ))}
        </div>
      </div>

      <div className="app-shell">
        <section className="section" id="how">
          <p className="section-label">01 · Simple enough for CT</p>
          <h2 className="section-title">Three moves. One desk.</h2>
          <p className="section-sub">
            Agency gave every coin a mind. X-DESK paid X users from fees. CREW
            keeps the part Pump.fun degens actually click: launch, name who eats,
            watch payouts hit the tape.
          </p>
          <div className="steps">
            <article className="step">
              <div className="step-num">Step 01</div>
              <h3>Name the coin</h3>
              <p>Image, ticker, one-line vibe. Optional tiny initial buy. Same muscle memory as Pump.</p>
            </article>
            <article className="step">
              <div className="step-num">Step 02</div>
              <h3>Tag the crew</h3>
              <p>Up to five X handles with permanent % cuts. KOLs, artists, mods — whoever ships the narrative.</p>
            </article>
            <article className="step">
              <div className="step-num">Step 03</div>
              <h3>Desk pays out</h3>
              <p>Fees claim → split → receipt on the board. Pick split, dip-buyback, or raid-pool mode.</p>
            </article>
          </div>
        </section>

        <section className="section" id="board">
          <p className="section-label">02 · Desk board</p>
          <h2 className="section-title">Money on the tape.</h2>
          <p className="section-sub">
            The feed is the product. If the community can see who got paid and
            why, the launch feels less like a ghost coin and more like a desk
            with a pulse.
          </p>
          <div className="board">
            <div className="panel">
              <div className="panel-head">
                <h3>Live remits</h3>
                <span className="live-dot">streaming</span>
              </div>
              <div className="feed">
                {feed.map((item, index) => (
                  <motion.div
                    className="feed-row"
                    key={item.id}
                    initial={{ opacity: 0, x: -8 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: Math.min(index, 8) * 0.05 }}
                  >
                    <div className="feed-time">
                      {item.time === "now" ? "just now" : `${item.time} ago`}
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
            <div className="panel">
              <div className="panel-head">
                <h3>Why CT clicks</h3>
                <span>non-sophisticated on purpose</span>
              </div>
              <div className="stats">
                <div className="stat">
                  <span>Platform cut</span>
                  <strong>0%</strong>
                </div>
                <div className="stat">
                  <span>Crew slots</span>
                  <strong>5</strong>
                </div>
                <div className="stat">
                  <span>Desk modes</span>
                  <strong>3</strong>
                </div>
                <div className="stat">
                  <span>Launch steps</span>
                  <strong>1</strong>
                </div>
              </div>
              <div className="why-list" style={{ padding: "0 1.1rem 1.2rem", gap: "0.85rem" }}>
                <div className="why-item">
                  <h3>Agency, stripped</h3>
                  <p>No full autonomous treasury mind. Just a desk that remits and optionally buybacks.</p>
                </div>
                <div className="why-item">
                  <h3>X-DESK, focused</h3>
                  <p>Skip stock pairs and FX rails for v1. SOL fee splits to named X crew first.</p>
                </div>
                <div className="why-item">
                  <h3>Pump-native</h3>
                  <p>Create on Pump bonding curve. Fee share config locked at launch. Receipts public.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="launch">
          <p className="section-label">03 · Launch desk</p>
          <h2 className="section-title">Ship a crew coin.</h2>
          <p className="section-sub">
            This UI is a working demo of the flow. Mainnet create needs a funded
            wallet + Pump SDK createV2 / fee-share instructions.
          </p>

          <div className="launch">
            <div className="panel form">
              <div className="row-2">
                <div className="field">
                  <label htmlFor="name">Token name</label>
                  <input
                    id="name"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder="Desk Cat"
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
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="vibe">One-line vibe</label>
                <textarea
                  id="vibe"
                  value={draft.vibe}
                  onChange={(e) => setDraft({ ...draft, vibe: e.target.value })}
                  placeholder="Who is this coin for?"
                />
              </div>

              <div className="field">
                <label>Desk mode</label>
                <div className="mode-pills">
                  {DESK_MODES.map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      className={`mode-pill${draft.mode === mode.id ? " active" : ""}`}
                      onClick={() => setDraft({ ...draft, mode: mode.id })}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
                <p className="hint">{modeMeta.blurb}</p>
              </div>

              <div className="field">
                <label>Crew fee split</label>
                <div className="crew-list">
                  {draft.crew.map((member, index) => (
                    <div className="crew-row" key={`crew-${index}`}>
                      <input
                        value={member.handle}
                        onChange={(e) => updateCrew(index, { handle: e.target.value })}
                        placeholder="@handle"
                      />
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={member.share}
                        onChange={(e) =>
                          updateCrew(index, { share: Number(e.target.value) })
                        }
                        placeholder="%"
                      />
                      <button type="button" onClick={() => removeCrew(index)} aria-label="Remove">
                        remove
                      </button>
                    </div>
                  ))}
                </div>
                <div className="hero-actions" style={{ marginTop: "0.35rem" }}>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={addCrew}
                    disabled={draft.crew.length >= MAX_CREW}
                  >
                    Add handle
                  </button>
                  <p className="hint" style={{ margin: 0 }}>
                    {draft.crew.length}/{MAX_CREW} · Allocated {shareTotal}% / 100%
                  </p>
                </div>
              </div>

              <div className="field">
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
                />
              </div>

              {error ? (
                <p className="hint" style={{ color: "var(--danger)" }}>
                  {error}
                </p>
              ) : null}

              <button className="btn btn-primary" type="button" onClick={onLaunch} disabled={busy}>
                {busy ? "Routing desk…" : "Launch crew coin (demo)"}
              </button>
            </div>

            <div className="panel preview">
              <div className="preview-token">
                <div className="token-art" aria-hidden />
                <div>
                  <h3>
                    ${draft.ticker || "TICKER"} · {draft.name || "Untitled"}
                  </h3>
                  <p>{draft.vibe || "Add a vibe so the desk has a story."}</p>
                </div>
              </div>

              <div>
                <p className="section-label" style={{ marginBottom: "0.7rem" }}>
                  Fee map
                </p>
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
                          style={{ width: `${Math.min(100, Math.max(0, member.share || 0))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <p className="hint">
                Mode: <strong style={{ color: "var(--ink)" }}>{modeMeta.label}</strong>.
                Platform fee narrative stays at 0% for v1 — sustainability can
                come from optional tip-on-launch later, not a silent skim.
              </p>

              {result ? (
                <motion.div
                  className="success"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <h4>Desk armed · demo mint ready</h4>
                  <p>
                    Mint <code>{result.mint}</code>
                    <br />
                    Sig <code>{result.signature.slice(0, 18)}…</code>
                    <br />
                    <a href={result.pumpUrl} target="_blank" rel="noreferrer">
                      Open pump.fun link
                    </a>
                    <br />
                    {result.note}
                  </p>
                </motion.div>
              ) : null}
            </div>
          </div>
        </section>

        <footer className="footer">
          <div>CREW · non-sophisticated fee desks for Pump.fun</div>
          <div>Inspired by Agency + X-DESK · not affiliated</div>
        </footer>
      </div>
    </div>
  );
}
