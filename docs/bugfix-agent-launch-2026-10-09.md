# Agent launch bugfix — 2026-10-09 (Qatar)

Sources: STRAW2GOLD + CATMEETING (against `0b0e2d6`), then $CADDY (fee-lock OK, atomic still sequential), plus code fixes on `main` that **production `crewpay-api` had not deployed** when $CADDY launched.

| ID | Severity | Status |
|----|----------|--------|
| B1 | High | **Still open in prod** — combined create+lock still falls back to ~2s sequential. Code on `main` prefers **Jito bundle first**, then v0+ALT, then sequential with `lockPath`/`createSlot`/`lockSlot` + failure reasons. **`api.crewpay.dev` was still serving the pre-Jito build** when $CADDY launched (no `/api/agent/launches`, old discovery notes). Manual Render deploy required. |
| B2 | High | **Fixed in code** — crank/desk use `OnlinePumpSdk.buildDistributeCreatorFeesInstructions` (6095) |
| B3 | Medium | **Fixed in code** — crank via `CREW_OPS_KEY` / buyback key |
| B4 | Medium | **Mitigated** — Autohire demotes weak/known-bad X (`oxrxbt`) |
| B5 | Low | **Fixed** + regression note |
| B6 | Low | **Fixed** — `GET /api/remits?mint=` + handle enrich |
| B7 | Cosmetic | **Fixed** — lamport deltas from tx meta |
| B8 | Docs | **Partial** — `hirePlan: null` when explicit crew |
| B9 | Low | **Fixed** — dry-run top-level `sufficient` |
| B10 | Low | **Fixed** — `effectiveBps` + `shareholders[]` |

## B1 follow-up — $CADDY (2026-10-09)

| | |
|--|--|
| Ticker | **$CADDY** |
| Mint | `FhxrtQoDApgN4hpjr9muMfjgQuGknJ2DPswa4CzMZA9H` |
| Fee-share | Locked exactly as planned; logo live on Pump.fun |
| Sniper leak | **None** this time (lucky empty gap) |
| Atomic path | Server reported combined tx failed → **two txs ~2s apart** (legacy sequential fallback) |
| Cost | ~0.0116 SOL create; burner left ~0.0164 SOL (needs top-up for another launch) |

**Root cause for this launch:** production API had not rolled `e161d62`+ (Jito-first atomic). Client still hit the old “try legacy combined → fall back sequential” path from `0b0e2d6`.

**After deploy, expected path:** `lockPath: "jito-bundle"` (or `atomic-v0` if `CREW_LOOKUP_TABLE` set). Sequential must include `atomicFailures` in `warning`.

## Operator knobs

```bash
# Render → crewpay-api → Manual Deploy (latest main) — required until autoDeploy catches up

# Compress static Pump accounts so single-tx atomic fits ≤1232 bytes
CREW_LOOKUP_TABLE=<alt-address>

# Abort launch instead of sequential race fallback
CREW_ATOMIC_REQUIRED=1

# Permissionless crank fee payer
CREW_OPS_KEY=<base58>

# Optional Jito
CREW_JITO_UUID=
CREW_JITO_BUNDLE_URL=https://mainnet.block-engine.jito.wtf/api/v1/bundles
```

## Evidence mints (daily watch)

- STRAW2GOLD `GKeoMKEsSZPch2WF8cRk7FLkYwj2kEj2rVWEi92tDkAp`
- CATMEETING `3Fh3khbEmChb7cbHW1r3BJLZFp4Q1rVUKbuSPFnjatNR`
- **$CADDY** `FhxrtQoDApgN4hpjr9muMfjgQuGknJ2DPswa4CzMZA9H`
