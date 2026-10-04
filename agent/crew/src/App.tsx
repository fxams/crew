import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import {
  DEFAULT_DRAFT,
  DESK_MODES,
  normalizeTicker,
  totalShare,
  type CrewMember,
  type LaunchDraft,
} from "./data";
import { ReceiptCard } from "./components/ReceiptCard";
import { AGENT_MODELS, CREW_VERSION, HIRE_ROLE_OPTIONS, MODE_DESK_BPS } from "./lib/config";
import {
  simulateBuybackFire,
  simulateFeeAccrual,
  simulateRaidClaim,
  solscanTokenUrl,
  solscanTxUrl,
} from "./lib/desk-actions";
import {
  CREW_EDGES,
  DEFAULT_BUYBACK,
  DEFAULT_RAID_QUESTS,
  LAUNCH_TEMPLATES,
  buildDeskPulse,
  buildScoreboard,
  deskStats,
  modeLabel,
  shareReceiptText,
  type LaunchTemplate,
} from "./lib/edges";
import type { HireRole } from "./lib/types";
import { launchCrew } from "./lib/launch";
import { distributeCreatorFees } from "./lib/pump/fees";
import {
  bareHandle,
  isPlaceholderHandle,
  linkLabel,
  resolveHandleWallet,
  type WalletResolveResult,
} from "./lib/pump/resolve-wallet";
import {
  applyNarrativeHire,
  type NarrativeHirePlan,
} from "./lib/pump/narrative-hire";
import {
  clearDraft,
  clearUiPrefs,
  loadBoard,
  loadDraft,
  loadUiPrefs,
  persistLaunch,
  persistRemit,
  persistRemits,
  resetBoard,
  saveDraft,
  saveUiPrefs,
} from "./lib/store";
import type { CoinRecord, RemitRecord } from "./lib/types";
import { getLaunchBlockers, isLaunchReady } from "./lib/validation";

type LinkStatus = {
  state: "idle" | "loading" | "linked" | "miss" | "error";
  detail?: string;
  wallet?: string;
};

const MAX_CREW = 5;

function shortAddr(addr: string) {
  if (!addr || addr.length < 10) return addr || "—";
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function relativeTime(at: number, now: number) {
  const delta = Math.max(0, now - at);
  const mins = Math.floor(delta / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function initialBoard() {
  return loadBoard();
}

function initialDraft(): LaunchDraft {
  const saved = loadDraft();
  if (!saved) return { ...DEFAULT_DRAFT, crew: DEFAULT_DRAFT.crew.map((m) => ({ ...m })) };
  return {
    ...DEFAULT_DRAFT,
    ...saved,
    crew: saved.crew?.length
      ? saved.crew.map((m) => ({ ...m }))
      : DEFAULT_DRAFT.crew.map((m) => ({ ...m })),
    buybackRule: saved.buybackRule ? { ...saved.buybackRule } : undefined,
    raidQuests: saved.raidQuests?.map((q) => ({ ...q })),
    agent: saved.agent ? { ...saved.agent } : undefined,
    twitter: saved.twitter ?? "",
    website: saved.website ?? "",
    imageFile: null,
  };
}

export default function App() {
  const wallet = useWallet();
  const { setVisible } = useWalletModal();
  const [draft, setDraft] = useState<LaunchDraft>(() => initialDraft());
  const [busy, setBusy] = useState(false);
  const [cranking, setCranking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [result, setResult] = useState<CoinRecord | null>(null);
  const [copied, setCopied] = useState<"mint" | "share" | null>(null);
  const [acting, setActing] = useState(false);
  const [boardTick] = useState(() => Date.now());
  const [desk, setDesk] = useState(() => {
    const board = initialBoard();
    return { coins: board.coins, remits: board.remits };
  });
  const [selectedCoin, setSelectedCoin] = useState<CoinRecord | null>(() => {
    const prefs = loadUiPrefs();
    if (!prefs.selectedMint) return null;
    const board = loadBoard();
    return board.coins.find((c) => c.mint === prefs.selectedMint) ?? null;
  });
  const [linkStatus, setLinkStatus] = useState<Record<number, LinkStatus>>({});
  const [hirePlan, setHirePlan] = useState<NarrativeHirePlan | null>(null);
  const autoFilledRef = useRef<Record<number, string>>({});
  const coins = desk.coins;
  const remits = desk.remits;
  const setCoins = (next: CoinRecord[]) => setDesk((d) => ({ ...d, coins: next }));
  const setRemits = (next: RemitRecord[]) => setDesk((d) => ({ ...d, remits: next }));

  // Persist launch draft (debounced) — survives refresh
  useEffect(() => {
    const t = window.setTimeout(() => saveDraft(draft), 300);
    return () => window.clearTimeout(t);
  }, [draft]);

  // Persist selected mint
  useEffect(() => {
    if (selectedCoin?.mint) saveUiPrefs({ selectedMint: selectedCoin.mint });
  }, [selectedCoin?.mint]);

  const shareTotal = useMemo(() => totalShare(draft.crew), [draft.crew]);
  const handleFingerprint = useMemo(
    () => draft.crew.map((m) => bareHandle(m.handle) || "").join("|"),
    [draft.crew],
  );

  // Auto-fill Solana wallets from Pump.fun user DB when a KOL/X handle is typed.
  useEffect(() => {
    const controllers: AbortController[] = [];
    const timers: number[] = [];
    const handles = handleFingerprint.split("|");

    handles.forEach((handle, index) => {
      if (!handle || isPlaceholderHandle(handle)) {
        setLinkStatus((prev) => {
          if (!prev[index]) return prev;
          const next = { ...prev };
          delete next[index];
          return next;
        });
        return;
      }

      setLinkStatus((prev) => ({
        ...prev,
        [index]: { state: "loading", detail: "Looking up Pump…" },
      }));

      const timer = window.setTimeout(() => {
        const ac = new AbortController();
        controllers.push(ac);
        void resolveHandleWallet(`@${handle}`, { signal: ac.signal }).then(
          (result: WalletResolveResult) => {
            if (ac.signal.aborted) return;
            if (!result.ok) {
              setLinkStatus((prev) => ({
                ...prev,
                [index]: { state: "miss", detail: result.error },
              }));
              return;
            }
            setLinkStatus((prev) => ({
              ...prev,
              [index]: {
                state: "linked",
                detail: linkLabel(result),
                wallet: result.wallet,
              },
            }));
            setDraft((prev) => {
              const row = prev.crew[index];
              if (!row) return prev;
              const current = (row.wallet || "").trim();
              const priorAuto = autoFilledRef.current[index] || "";
              // Don't clobber a manually typed wallet.
              if (current && current !== priorAuto && current !== result.wallet) {
                return prev;
              }
              if (current === result.wallet) {
                autoFilledRef.current[index] = result.wallet;
                return prev;
              }
              autoFilledRef.current[index] = result.wallet;
              return {
                ...prev,
                crew: prev.crew.map((m, i) =>
                  i === index ? { ...m, wallet: result.wallet } : m,
                ),
              };
            });
          },
        );
      }, 450);
      timers.push(timer);
    });

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      controllers.forEach((c) => c.abort());
    };
  }, [handleFingerprint]);
  const modeMeta = DESK_MODES.find((mode) => mode.id === draft.mode)!;
  const allocOk = shareTotal === 100;
  const deskBps = MODE_DESK_BPS[draft.mode];
  const connected = Boolean(wallet.publicKey);
  const launchReady = isLaunchReady(draft);
  const launchBlockers = useMemo(() => getLaunchBlockers(draft), [draft]);
  const imagePreviewUrl = useMemo(() => {
    if (!draft.imageFile) return null;
    return URL.createObjectURL(draft.imageFile);
  }, [draft.imageFile]);
  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    };
  }, [imagePreviewUrl]);
  const stats = useMemo(() => deskStats(coins, remits), [coins, remits]);
  const scoreboard = useMemo(() => buildScoreboard(remits), [remits]);
  const pulse = useMemo(
    () => buildDeskPulse(coins, remits, boardTick),
    [coins, remits, boardTick],
  );

  const tapeItems = useMemo(() => {
    const fromRemits = remits.slice(0, 16).map((r) => ({
      id: r.id,
      text:
        r.amountSol > 0
          ? `paid ${r.handle} · ${r.amountSol.toFixed(4)} SOL · $${r.ticker}`
          : `locked ${r.handle} · $${r.ticker} fee share`,
    }));
    if (fromRemits.length) return fromRemits;
    return [{ id: "empty", text: "desk live — connect Phantom and launch a crew coin" }];
  }, [remits]);

  const feed = useMemo(() => {
    const launchRows = coins.slice(0, 8).map((c) => ({
      id: `coin_${c.id}`,
      time: relativeTime(c.launchedAt, boardTick),
      title: `$${c.ticker} crew locked`,
      detail: `${c.crew.map((m) => `${m.handle} ${m.share}%`).join(" · ")} · mainnet`,
      amount: "LIVE",
      mint: c.mint,
      coin: c,
    }));
    const remitRows = remits.slice(0, 12).map((r) => ({
      id: `remit_${r.id}`,
      time: relativeTime(r.at, boardTick),
      title: `${r.handle} remit`,
      detail: `$${r.ticker} · ${r.mode}${r.wallet ? ` · ${shortAddr(r.wallet)}` : ""}`,
      amount: r.amountSol > 0 ? `+${r.amountSol.toFixed(4)}` : "LOCK",
      mint: r.mint,
      coin: coins.find((c) => c.mint === r.mint) ?? null,
    }));
    return [...remitRows, ...launchRows].slice(0, 24);
  }, [coins, remits, boardTick]);

  function updateCrew(index: number, patch: Partial<CrewMember>) {
    if (typeof patch.wallet === "string") {
      const priorAuto = autoFilledRef.current[index] || "";
      if (patch.wallet.trim() !== priorAuto) {
        delete autoFilledRef.current[index];
      }
    }
    // Normalize pasted x.com / pump.fun/profile URLs into @handles
    if (typeof patch.handle === "string") {
      const bare = bareHandle(patch.handle);
      if (bare && (patch.handle.includes("/") || patch.handle.includes("http"))) {
        patch = { ...patch, handle: `@${bare}` };
      }
    }
    setDraft((prev) => ({
      ...prev,
      crew: prev.crew.map((member, i) => (i === index ? { ...member, ...patch } : member)),
    }));
  }

  function addCrew() {
    setDraft((prev) => {
      if (prev.crew.length >= MAX_CREW) return prev;
      return { ...prev, crew: [...prev.crew, { handle: "@", wallet: "", share: 0 }] };
    });
  }

  function removeCrew(index: number) {
    setDraft((prev) => {
      if (prev.crew.length <= 1) return prev;
      return { ...prev, crew: prev.crew.filter((_, i) => i !== index) };
    });
  }

  function onImage(file: File | null) {
    setDraft((prev) => ({ ...prev, imageFile: file }));
  }

  function autoHireFromNarrative() {
    const { draft: next, plan } = applyNarrativeHire(draft, { limit: 3 });
    autoFilledRef.current = {};
    next.crew.forEach((m, i) => {
      if (m.wallet) autoFilledRef.current[i] = m.wallet;
    });
    setDraft(next);
    setHirePlan(plan);
    setLinkStatus(
      Object.fromEntries(
        plan.hires.map((h, i) => [
          i,
          {
            state: "linked" as const,
            detail: `KOL #${h.kol.rank} · ${h.reasons[0] || "narrative fit"} · ${h.kol.wallet.slice(0, 4)}…${h.kol.wallet.slice(-4)}`,
            wallet: h.kol.wallet,
          },
        ]),
      ),
    );
    setStatus(
      `Auto-hired ${plan.hires.length} KOLs for [${plan.match.tags.join(", ")}]`,
    );
    setError(null);
  }

  function applyTemplate(tpl: LaunchTemplate) {
    setDraft((prev) => ({
      ...prev,
      ...tpl.draft,
      // Keep name/ticker/description/socials/image the user already typed.
      name: prev.name,
      ticker: prev.ticker,
      vibe: prev.vibe,
      twitter: prev.twitter,
      website: prev.website,
      imageFile: prev.imageFile,
      crew: tpl.draft.crew.map((m) => ({ ...m })),
      buybackRule: tpl.draft.buybackRule ? { ...tpl.draft.buybackRule } : undefined,
      raidQuests: tpl.draft.raidQuests?.map((q) => ({ ...q })),
      agent: tpl.draft.agent ? { ...tpl.draft.agent } : undefined,
    }));
    setHirePlan(null);
    setError(null);
    setStatus(`Mode: ${tpl.label}`);
  }

  function setMode(mode: LaunchDraft["mode"]) {
    setDraft((prev) => ({
      ...prev,
      mode,
      buybackRule:
        mode === "buyback" ? prev.buybackRule ?? { ...DEFAULT_BUYBACK } : undefined,
      raidQuests:
        mode === "raid"
          ? prev.raidQuests ?? DEFAULT_RAID_QUESTS.map((q) => ({ ...q }))
          : undefined,
      agent:
        mode === "agent"
          ? prev.agent ?? { name: "", objective: "", model: "custom" }
          : undefined,
      crew:
        mode === "agent"
          ? prev.crew.map((m, i) => ({
              ...m,
              hireRole:
                m.hireRole ??
                (["caller", "chart", "kol", "raid", "dev"][i] as HireRole) ??
                "kol",
            }))
          : prev.crew,
    }));
  }

  async function onLaunch() {
    if (!isLaunchReady(draft)) {
      setError(`Fill required fields: ${getLaunchBlockers(draft).slice(0, 3).join(", ")}`);
      return;
    }
    if (!connected) {
      setVisible(true);
      setError("Connect Phantom to launch on Solana mainnet.");
      return;
    }

    setBusy(true);
    setError(null);
    setStatus("Uploading metadata (approve Phantom if prompted)…");
    setResult(null);
    setCopied(null);

    const response = await launchCrew(draft, { wallet });

    setBusy(false);
    setStatus(null);

    if (!response.ok) {
      const msg = response.error || "Launch failed.";
      setError(
        /load failed|failed to fetch/i.test(msg)
          ? "Metadata upload failed. Approve the Phantom storage signature, then try again."
          : msg,
      );
      return;
    }

    const board = persistLaunch(response.coin, response.remits);
    setCoins(board.coins);
    setRemits(board.remits);
    setResult(response.coin);
    setSelectedCoin(response.coin);
    // Keep form values for a quick re-launch, but drop transient image blob.
    setDraft((prev) => ({ ...prev, crew: response.coin.crew, imageFile: null }));
  }

  async function onCrank(mint: string, ticker: string) {
    if (!connected) {
      setVisible(true);
      setError("Connect Phantom to crank remits.");
      return;
    }
    setCranking(mint);
    setError(null);
    try {
      const signature = await distributeCreatorFees(mint, wallet);
      const coinMode = coins.find((c) => c.mint === mint)?.mode ?? "split";
      const board = persistRemit({
        id: `crank_${Math.random().toString(36).slice(2, 10)}`,
        mint,
        ticker,
        handle: coinMode === "agent" ? "@agent" : coinMode === "raid" ? "@raid" : coinMode === "buyback" ? "@buyback" : "@desk",
        wallet: wallet.publicKey?.toBase58() ?? "",
        amountSol: 0,
        mode: coinMode,
        at: Number(new Date()),
        signature,
      });
      setRemits(board.remits);
      setStatus(`Remits cranked · ${shortAddr(signature)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Crank failed.");
    } finally {
      setCranking(null);
    }
  }

  async function copyMint() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.mint);
      setCopied("mint");
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied(null);
    }
  }

  async function copyShare(coin: CoinRecord) {
    try {
      await navigator.clipboard.writeText(shareReceiptText(coin));
      setCopied("share");
      setStatus("CT receipt copied.");
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setError("Could not copy share text.");
    }
  }

  function runDeskAction(label: string, fn: () => RemitRecord[]) {
    if (!selectedCoin) return;
    setActing(true);
    setError(null);
    try {
      const next = fn();
      const board = persistRemits(next);
      setRemits(board.remits);
      setStatus(label);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Desk action failed.");
    } finally {
      setActing(false);
    }
  }

  function onSimulateFees() {
    if (!selectedCoin) return;
    runDeskAction(`Simulated fees on $${selectedCoin.ticker}`, () =>
      simulateFeeAccrual(selectedCoin),
    );
  }

  function onFireBuyback() {
    if (!selectedCoin) return;
    runDeskAction(`Buyback fired on $${selectedCoin.ticker}`, () => [
      simulateBuybackFire(selectedCoin),
    ]);
  }

  function onRaidClaim(questId?: string) {
    if (!selectedCoin) return;
    runDeskAction(`Raid claim on $${selectedCoin.ticker}`, () => [
      simulateRaidClaim(selectedCoin, questId),
    ]);
  }

  function onResetBoard() {
    const board = resetBoard();
    clearDraft();
    clearUiPrefs();
    setCoins(board.coins);
    setRemits(board.remits);
    setSelectedCoin(null);
    setResult(null);
    setHirePlan(null);
    setDraft({
      ...DEFAULT_DRAFT,
      crew: DEFAULT_DRAFT.crew.map((m) => ({ ...m })),
    });
    setStatus("Desk board + draft cleared.");
  }

  const tape = [...tapeItems, ...tapeItems];
  const launchLabel = busy
    ? "Signing…"
    : !launchReady
      ? "Fill required fields"
      : connected
        ? "Launch on mainnet"
        : "Connect & launch";

  const buyback = draft.buybackRule ?? DEFAULT_BUYBACK;
  const quests = draft.raidQuests ?? DEFAULT_RAID_QUESTS;

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
            <a href="#edges">Edges</a>
            <a href="#board">Tape</a>
            <button
              type="button"
              className={`btn btn-ghost btn-nav wallet-btn${connected ? " is-on" : ""}`}
              onClick={() => setVisible(true)}
            >
              {connected ? shortAddr(wallet.publicKey!.toBase58()) : "Connect"}
            </button>
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
              <p className="section-label">Pump.fun fee desk · v{CREW_VERSION}</p>
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
                Agency minds meet CREW payroll. Spin an agent that{" "}
                <em>hires</em> KOLs and X accounts — permanent on-chain fee splits,{" "}
                <em>0% platform cut.</em>
              </p>
              <div className="hero-actions">
                <a className="btn btn-primary" href="#launch">
                  Launch coin
                </a>
                <a className="btn btn-ghost" href="#edges">
                  Why CREW
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
              <p>Ticker + vibe. Optional buy.</p>
            </article>
            <article className="step">
              <div className="step-num">02</div>
              <h3>Hire crew</h3>
              <p>KOLs / X + wallets. Or agent mode.</p>
            </article>
            <article className="step">
              <div className="step-num">03</div>
              <h3>Get paid</h3>
              <p>On-chain split → crank.</p>
            </article>
          </div>
        </section>

        <section className="section" id="edges">
          <div className="section-head-row">
            <div>
              <p className="section-label">vs Agency</p>
              <h2 className="section-title">Our edges.</h2>
            </div>
            <div className="stat-strip" aria-label="Desk stats">
              <span>
                <strong>{stats.platformCut}%</strong> cut
              </span>
              <span>
                <strong>{stats.paidSol.toFixed(3)}</strong> SOL paid
              </span>
              <span>
                <strong>{stats.humanRemits}</strong> human remits
              </span>
            </div>
          </div>
          <p className="section-sub edge-sub">
            Agency is infrastructure for living AI tokens — fees fund minds and burn
            $AGENCY. CREW is the fee desk for living <em>crews</em>.
          </p>
          <div className="edge-grid">
            {CREW_EDGES.map((edge, index) => (
              <motion.article
                className="edge-card"
                key={edge.id}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: Math.min(index, 4) * 0.05 }}
              >
                <h3>{edge.title}</h3>
                <p className="edge-agency">
                  <span>Agency</span> {edge.agency}
                </p>
                <p className="edge-crew">
                  <span>CREW</span> {edge.crew}
                </p>
              </motion.article>
            ))}
          </div>
        </section>

        <section className="section" id="board">
          <div className="section-head-row">
            <div>
              <p className="section-label">Desk board</p>
              <h2 className="section-title">Money on the tape.</h2>
            </div>
            <div className="stat-strip" aria-label="Board counts">
              <span>
                <strong>{coins.length}</strong> coins
              </span>
              <span>
                <strong>{remits.length}</strong> remits
              </span>
              <span>
                <strong>mainnet</strong> live
              </span>
              <button type="button" className="stat-reset" onClick={onResetBoard}>
                Clear
              </button>
            </div>
          </div>

          <div className="board-grid">
            <div className="panel">
              <div className="panel-head">
                <h3>Desk pulse</h3>
                <span className="live-dot">live</span>
              </div>
              <div className="feed">
                {pulse.length === 0 ? (
                  <p className="hint score-empty">Waiting for the first mainnet launch.</p>
                ) : (
                  pulse.map((item, index) => (
                    <motion.div
                      className={`feed-row pulse-${item.kind}`}
                      key={item.id}
                      initial={{ opacity: 0, y: 6 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: Math.min(index, 6) * 0.03 }}
                    >
                      <div className="feed-time">{item.time}</div>
                      <div className="feed-main">
                        <strong>{item.title}</strong>
                        <p>{item.detail}</p>
                      </div>
                      <div className="feed-amt">{item.amount}</div>
                    </motion.div>
                  ))
                )}
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <h3>Crew scoreboard</h3>
                <span>humans paid</span>
              </div>
              <div className="score-list">
                {scoreboard.length === 0 ? (
                  <p className="hint score-empty">No remits yet — launch and get paid.</p>
                ) : (
                  scoreboard.map((row, index) => (
                    <div className="score-row" key={row.handle}>
                      <div className="score-rank">#{index + 1}</div>
                      <div className="score-main">
                        <strong>{row.handle}</strong>
                        <p>
                          {row.remits} remits · {row.tickers.map((t) => `$${t}`).join(" ")}
                        </p>
                      </div>
                      <div className="score-amt">{row.totalSol.toFixed(4)}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="panel crank-panel">
            <div className="panel-head">
              <h3>Live remits</h3>
              <span className="live-dot">tape</span>
            </div>
            <div className="feed">
              {feed.length === 0 ? (
                <p className="hint score-empty">
                  No launches yet. Connect Phantom and ship a crew coin on mainnet.
                </p>
              ) : (
                feed.map((item) => (
                  <button
                    type="button"
                    className="feed-row feed-btn"
                    key={item.id}
                    onClick={() => item.coin && setSelectedCoin(item.coin)}
                  >
                    <div className="feed-time">{item.time}</div>
                    <div className="feed-main">
                      <strong>{item.title}</strong>
                      <p>{item.detail}</p>
                    </div>
                    <div className="feed-amt">{item.amount}</div>
                  </button>
                ))
              )}
            </div>
          </div>

          {selectedCoin ? (
            <div className="panel coin-desk">
              <div className="panel-head">
                <h3>
                  ${selectedCoin.ticker} desk · {modeLabel(selectedCoin.mode)}
                </h3>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setSelectedCoin(null)}
                >
                  Close
                </button>
              </div>
              <div className="coin-desk-body">
                <p className="hint">
                  {selectedCoin.vibe || "No vibe."} · mainnet ·{" "}
                  {shortAddr(selectedCoin.mint)}
                </p>
                <div className="coin-desk-layout">
                  <div className="coin-desk-main">
                    <div className="split-bars">
                      {selectedCoin.crew.map((m) => (
                        <div className="split-bar" key={`${selectedCoin.mint}-${m.handle}`}>
                          <div className="split-meta">
                            <span>{m.handle}</span>
                            <span>{m.share}%</span>
                          </div>
                          <div className="split-track">
                            <div className="split-fill" style={{ width: `${m.share}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                    {selectedCoin.mode === "buyback" && selectedCoin.buybackRule ? (
                      <p className="hint">
                        Dip rule: −{selectedCoin.buybackRule.dipPct}% → ≤
                        {selectedCoin.buybackRule.maxSolPerFire} SOL ·{" "}
                        {selectedCoin.buybackRule.cooldownHours}h cooldown
                      </p>
                    ) : null}
                    {selectedCoin.mode === "raid" && selectedCoin.raidQuests?.length ? (
                      <div className="quest-mini">
                        {selectedCoin.raidQuests.map((q) => (
                          <div className="quest-chip quest-chip-row" key={q.id}>
                            <div>
                              <strong>{(q.bountyBps / 100).toFixed(0)}%</strong> {q.title}
                              <span className="quest-proof"> · {q.proof}</span>
                            </div>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              disabled={acting}
                              onClick={() => onRaidClaim(q.id)}
                            >
                              Claim
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <div className="success-actions">
                      <button
                        className="btn btn-primary btn-sm"
                        type="button"
                        disabled={acting}
                        onClick={onSimulateFees}
                      >
                        {acting ? "Routing…" : "Preview fee split"}
                      </button>
                      {selectedCoin.mode === "buyback" ? (
                        <button
                          className="btn btn-ghost btn-sm"
                          type="button"
                          disabled={acting}
                          onClick={onFireBuyback}
                        >
                          Fire buyback
                        </button>
                      ) : null}
                      <a
                        className="btn btn-ghost btn-sm"
                        href={selectedCoin.pumpUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        pump.fun
                      </a>
                      {solscanTokenUrl(selectedCoin.mint) ? (
                        <a
                          className="btn btn-ghost btn-sm"
                          href={solscanTokenUrl(selectedCoin.mint)!}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Solscan
                        </a>
                      ) : null}
                      {solscanTxUrl(selectedCoin.signature) ? (
                        <a
                          className="btn btn-ghost btn-sm"
                          href={solscanTxUrl(selectedCoin.signature)!}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Tx
                        </a>
                      ) : null}
                      <button
                        className="btn btn-ghost btn-sm"
                        type="button"
                        disabled={cranking === selectedCoin.mint}
                        onClick={() => void onCrank(selectedCoin.mint, selectedCoin.ticker)}
                      >
                        {cranking === selectedCoin.mint ? "Cranking…" : "Distribute"}
                      </button>
                    </div>
                  </div>
                  <ReceiptCard
                    coin={selectedCoin}
                    copied={copied === "share"}
                    onCopy={() => void copyShare(selectedCoin)}
                  />
                </div>
              </div>
            </div>
          ) : null}

          {coins.length ? (
            <div className="panel crank-panel">
              <div className="panel-head">
                <h3>Crank remits</h3>
                <span>mainnet</span>
              </div>
              <div className="crank-list">
                {coins.slice(0, 8).map((c) => (
                  <div className="crank-row" key={c.mint}>
                    <div>
                      <strong>${c.ticker}</strong>
                      <p>{shortAddr(c.mint)}</p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={cranking === c.mint}
                      onClick={() => void onCrank(c.mint, c.ticker)}
                    >
                      {cranking === c.mint ? "Cranking…" : "Distribute"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section className="section" id="launch">
          <p className="section-label">Launch desk</p>
          <h2 className="section-title">Ship a crew coin.</h2>
          <p className="section-sub">
            Same coin fields as pump.fun — name, ticker, image required. Description,
            X, and website optional. Then lock crew fee-share on mainnet.
          </p>

          <div className="template-row" aria-label="Launch templates">
            {LAUNCH_TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                className="template-chip"
                onClick={() => applyTemplate(tpl)}
              >
                <strong>{tpl.label}</strong>
                <span>{tpl.blurb}</span>
              </button>
            ))}
          </div>

          <div className="launch">
            <div className="panel form">
              <div className="field">
                <label>Wallet</label>
                <button
                  type="button"
                  className={`btn btn-wide${connected ? " btn-ghost" : " btn-primary"}`}
                  onClick={() => setVisible(true)}
                >
                  {connected
                    ? `Connected · ${shortAddr(wallet.publicKey!.toBase58())}`
                    : "Connect Phantom"}
                </button>
              </div>

              <div className="row-2">
                <div className="field">
                  <label htmlFor="name">Coin name</label>
                  <input
                    id="name"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder="name"
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
                    placeholder="ticker"
                    autoComplete="off"
                    inputMode="text"
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="vibe">Description (optional)</label>
                <input
                  id="vibe"
                  value={draft.vibe}
                  onChange={(e) => setDraft({ ...draft, vibe: e.target.value })}
                  placeholder="description"
                  autoComplete="off"
                />
              </div>

              <div className="field">
                <label htmlFor="image">Coin image</label>
                <input
                  id="image"
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  onChange={(e) => onImage(e.target.files?.[0] ?? null)}
                  required
                />
                {draft.imageFile ? (
                  <p className="hint is-ok">{draft.imageFile.name}</p>
                ) : null}
              </div>

              <div className="field">
                <label>Social links (optional)</label>
                <div className="row-2">
                  <input
                    value={draft.twitter ?? ""}
                    onChange={(e) => setDraft({ ...draft, twitter: e.target.value })}
                    placeholder="https://x.com/username"
                    autoComplete="off"
                    spellCheck={false}
                    aria-label="X or Twitter"
                  />
                  <input
                    value={draft.website ?? ""}
                    onChange={(e) => setDraft({ ...draft, website: e.target.value })}
                    placeholder="https://yoursite.com"
                    autoComplete="off"
                    spellCheck={false}
                    aria-label="Website"
                  />
                </div>
                <p className="hint">
                  X format: https://x.com/username or @username · Website: https://…
                </p>
              </div>

              <div className="field">
                <label>Mode</label>
                <div className="mode-grid mode-grid-4" role="radiogroup" aria-label="Desk mode">
                  {DESK_MODES.map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      role="radio"
                      aria-checked={draft.mode === mode.id}
                      className={`mode-option${draft.mode === mode.id ? " active" : ""}`}
                      onClick={() => setMode(mode.id)}
                    >
                      <strong className="mode-full">{mode.label}</strong>
                      <strong className="mode-short">{mode.short}</strong>
                    </button>
                  ))}
                </div>
              </div>

              {draft.mode === "agent" ? (
                <div className="field program-box">
                  <label>Agent brief</label>
                  <div className="row-2">
                    <input
                      value={draft.agent?.name ?? ""}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          agent: {
                            ...(draft.agent ?? { name: "", objective: "", model: "custom" }),
                            name: e.target.value,
                          },
                        })
                      }
                      placeholder="Agent name"
                      autoComplete="off"
                    />
                    <select
                      className="role-select"
                      value={draft.agent?.model ?? "custom"}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          agent: {
                            ...(draft.agent ?? { name: "", objective: "", model: "custom" }),
                            model: e.target.value,
                          },
                        })
                      }
                      aria-label="Agent model label"
                    >
                      {AGENT_MODELS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                  <input
                    value={draft.agent?.objective ?? ""}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        agent: {
                          ...(draft.agent ?? { name: "", objective: "", model: "custom" }),
                          objective: e.target.value,
                        },
                      })
                    }
                    placeholder="Objective"
                    autoComplete="off"
                  />
                </div>
              ) : null}

              {draft.mode === "buyback" ? (
                <div className="field program-box">
                  <label>Buyback rule</label>
                  <div className="row-3">
                    <label className="mini-field">
                      Dip %
                      <input
                        type="number"
                        min={5}
                        max={80}
                        value={buyback.dipPct}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            buybackRule: {
                              ...buyback,
                              dipPct: Number(e.target.value),
                            },
                          })
                        }
                      />
                    </label>
                    <label className="mini-field">
                      Max SOL
                      <input
                        type="number"
                        min={0.01}
                        step={0.01}
                        value={buyback.maxSolPerFire}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            buybackRule: {
                              ...buyback,
                              maxSolPerFire: Number(e.target.value),
                            },
                          })
                        }
                      />
                    </label>
                    <label className="mini-field">
                      Cooldown h
                      <input
                        type="number"
                        min={1}
                        max={72}
                        value={buyback.cooldownHours}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            buybackRule: {
                              ...buyback,
                              cooldownHours: Number(e.target.value),
                            },
                          })
                        }
                      />
                    </label>
                  </div>
                </div>
              ) : null}

              {draft.mode === "raid" ? (
                <div className="field program-box">
                  <label>Raid quests</label>
                  <div className="quest-edit">
                    {quests.map((q, index) => (
                      <div className="quest-edit-row" key={q.id}>
                        <input
                          value={q.title}
                          onChange={(e) => {
                            const next = quests.map((item, i) =>
                              i === index ? { ...item, title: e.target.value } : item,
                            );
                            setDraft({ ...draft, raidQuests: next });
                          }}
                          aria-label={`Quest ${index + 1} title`}
                        />
                        <input
                          className="pct-input"
                          type="number"
                          min={1}
                          max={100}
                          value={Math.round(q.bountyBps / 100)}
                          onChange={(e) => {
                            const next = quests.map((item, i) =>
                              i === index
                                ? { ...item, bountyBps: Number(e.target.value) * 100 }
                                : item,
                            );
                            setDraft({ ...draft, raidQuests: next });
                          }}
                          aria-label={`Quest ${index + 1} bounty %`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="field">
                <label>Crew split + wallets</label>
                <div className="hire-actions">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={autoHireFromNarrative}
                    disabled={!draft.name.trim() && !draft.vibe.trim() && !draft.ticker.trim()}
                  >
                    Auto-hire KOLs from narrative
                  </button>
                </div>
                {hirePlan ? (
                  <div className="hire-plan" role="status">
                    <p className="hire-plan-tags">
                      Narrative: {hirePlan.match.tags.map((t) => `#${t}`).join(" · ")}
                    </p>
                    <ul className="hire-plan-list">
                      {hirePlan.hires.map((h) => (
                        <li key={h.kol.id}>
                          <strong>#{h.kol.rank} @{h.kol.x || h.kol.pump}</strong>
                          {" · "}
                          {h.share}% · {h.role}
                          {" · "}
                          {(h.kol.followers / 1000).toFixed(h.kol.followers >= 10_000 ? 0 : 1)}k foll
                          {h.reasons[0] ? ` · ${h.reasons[0]}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="crew-list">
                  {draft.crew.map((member, index) => (
                    <div className="crew-block has-wallet" key={`crew-${index}`}>
                      <div className="crew-row">
                        <input
                          value={member.handle}
                          onChange={(e) => updateCrew(index, { handle: e.target.value })}
                          placeholder="@handle"
                          autoComplete="off"
                          spellCheck={false}
                          inputMode="text"
                          aria-label={`Crew handle ${index + 1}`}
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
                          aria-label={`Crew share ${index + 1}`}
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
                      <input
                        className={`wallet-input${
                          linkStatus[index]?.state === "linked" ? " is-linked" : ""
                        }`}
                        value={member.wallet}
                        onChange={(e) => updateCrew(index, { wallet: e.target.value })}
                        placeholder="Solana wallet"
                        autoComplete="off"
                        spellCheck={false}
                        aria-label={`Crew wallet ${index + 1}`}
                      />
                      {linkStatus[index]?.detail ? (
                        <p
                          className={`link-status link-${linkStatus[index].state}`}
                          role="status"
                        >
                          {linkStatus[index].state === "loading"
                            ? "Looking up…"
                            : linkStatus[index].detail}
                        </p>
                      ) : null}
                      {draft.mode === "agent" ? (
                        <select
                          className="role-select"
                          value={member.hireRole ?? "kol"}
                          onChange={(e) =>
                            updateCrew(index, {
                              hireRole: e.target.value as HireRole,
                            })
                          }
                          aria-label={`Hire role ${index + 1}`}
                        >
                          {HIRE_ROLE_OPTIONS.map((role) => (
                            <option key={role.id} value={role.id}>
                              Hire as {role.label}
                            </option>
                          ))}
                        </select>
                      ) : null}
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
              {status ? <p className="form-status">{status}</p> : null}
              {!launchReady && !busy ? (
                <p className="hint is-bad">
                  Required: {launchBlockers.slice(0, 4).join(" · ")}
                  {launchBlockers.length > 4 ? "…" : ""}
                </p>
              ) : null}

              <button
                className="btn btn-primary btn-wide desktop-launch"
                type="button"
                onClick={() => void onLaunch()}
                disabled={busy || !launchReady}
              >
                {launchLabel}
              </button>
            </div>

            <div className="panel preview">
              <div className="preview-token">
                <div
                  className="token-art"
                  aria-hidden
                  style={
                    imagePreviewUrl
                      ? {
                          backgroundImage: `url(${imagePreviewUrl})`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }
                      : undefined
                  }
                />
                <div>
                  <h3>
                    ${draft.ticker || "TICKER"} · {draft.name || "name"}
                  </h3>
                  <p>{draft.vibe || "Add a vibe."}</p>
                </div>
              </div>

              <div>
                <p className="section-label fee-map-label">Fee map</p>
                <div className="split-bars">
                  {deskBps > 0 ? (
                    <div className="split-bar">
                      <div className="split-meta">
                        <span>
                          {draft.mode === "agent"
                            ? `@agent · ${draft.agent?.name || "ops"}`
                            : draft.mode === "raid"
                              ? "@raid pool"
                              : "@desk (buyback)"}
                        </span>
                        <span>{deskBps / 100}%</span>
                      </div>
                      <div className="split-track">
                        <div
                          className="split-fill desk-fill"
                          style={{ width: `${deskBps / 100}%` }}
                        />
                      </div>
                    </div>
                  ) : null}
                  {draft.crew.map((member, index) => {
                    const crewPct =
                      deskBps > 0
                        ? Math.round(((10_000 - deskBps) * (member.share || 0)) / 100) / 100
                        : member.share || 0;
                    return (
                      <div className="split-bar" key={`split-${index}`}>
                        <div className="split-meta">
                          <span>
                            {member.handle || "@?"}
                            {member.hireRole ? ` · ${member.hireRole}` : ""}
                            {member.wallet ? ` · ${shortAddr(member.wallet)}` : ""}
                          </span>
                          <span>{crewPct}%</span>
                        </div>
                        <div className="split-track">
                          <div
                            className="split-fill"
                            style={{
                              width: `${Math.min(100, Math.max(0, crewPct))}%`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <p className="hint">
                <strong style={{ color: "var(--ink)" }}>{modeMeta.label}</strong>
                {" · on-chain fee-share · "}0% platform cut
              </p>

              {result ? (
                <motion.div
                  className="success"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <h4>Mainnet mint live</h4>
                  <p>
                    <code>{result.mint}</code>
                  </p>
                  {result.signature && result.signature !== "seed" ? (
                    <p className="hint">
                      tx {shortAddr(result.signature)}
                      {result.feeShareSignature
                        ? ` · fees ${shortAddr(result.feeShareSignature)}`
                        : ""}
                    </p>
                  ) : null}
                  <ReceiptCard
                    coin={result}
                    copied={copied === "share"}
                    onCopy={() => void copyShare(result)}
                  />
                  <div className="success-actions">
                    <button className="btn btn-ghost btn-sm" type="button" onClick={copyMint}>
                      {copied === "mint" ? "Copied" : "Copy mint"}
                    </button>
                    <button
                      className="btn btn-primary btn-sm"
                      type="button"
                      onClick={() => {
                        setSelectedCoin(result);
                        document.getElementById("board")?.scrollIntoView({ behavior: "smooth" });
                      }}
                    >
                      Open desk
                    </button>
                    <a
                      className="btn btn-ghost btn-sm"
                      href={result.pumpUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      pump.fun
                    </a>
                  </div>
                </motion.div>
              ) : null}
            </div>
          </div>
        </section>

        <footer className="footer">
          <div>CREW · humans get paid · v{CREW_VERSION}</div>
          <div>0% cut · no AI skim · no $CREW burn tax</div>
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
            if (!launchReady) return;
            void onLaunch();
          }}
          disabled={busy || !launchReady}
        >
          {launchLabel}
        </button>
      </div>
    </div>
  );
}
