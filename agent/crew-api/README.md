# CREW API

Postgres-backed API for CREW launches, remits, KOL directory, buyback cron, and **agent launch**.

Production: https://api.crewpay.dev  
Legacy alias: https://crewpay-api.onrender.com (see `agent/crew/DOMAINS.md` for DNS)

## Services (Render)

| Service | Role |
|---------|------|
| `crewpay-db` | Postgres 16 |
| `crewpay-api` | Express API (`npm start`) |
| `crewpay-buyback` | Cron → `npm run buyback` |

## Endpoints

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/healthz` | public |
| GET | `/api/board` | public |
| GET | `/api/coins` | public |
| PUT | `/api/coins` | `x-crew-api-key` |
| GET | `/api/remits` | public |
| POST | `/api/remits` | `x-crew-api-key` |
| GET | `/api/kols?q=` | public |
| GET | `/api/agent` | public discovery docs |
| GET | `/llms.txt` | llmstxt.org index (frontier LLMs) |
| GET | `/llms-full.txt` | full agent instructions |
| GET | `/openapi.json` | OpenAPI 3.1 |
| GET | `/.well-known/agent.json` | agent card |
| GET | `/.well-known/ai-plugin.json` | ChatGPT-style plugin manifest |
| POST | `/api/agent/autohire` | `CREW_AGENT_API_KEY` |
| POST | `/api/agent/launch` | `CREW_AGENT_API_KEY` + `x-launcher-key` (+ optional `x-idempotency-key`) |
| GET | `/api/agent/status/:mint` | `CREW_AGENT_API_KEY` |
| POST | `/api/agent/wire-fees` | `CREW_AGENT_API_KEY` + `x-launcher-key` |
| POST | `/api/agent/lock-holder-kol` | `CREW_AGENT_API_KEY` + `x-launcher-key` |
| POST | `/api/agent/crank` | `CREW_AGENT_API_KEY` + `x-launcher-key` |
| GET | `/api/proof` | public buyback + remit proof |
| GET | `/api/buybacks` | public buyback history |
| POST | `/api/webhooks` | `CREW_AGENT_API_KEY` |
| POST | `/api/agent/keys` | mint per-agent keys |

**How agents discover this:** crawl `https://crewpay.dev/llms.txt` or `GET https://api.crewpay.dev/` → follow `llms` / `agent` / `openapi` / `mcp` / `proof`. Mirrors ship on the site for GPTBot, ClaudeBot, Gemini, Grok, and other frontier crawlers.

**MCP (crypto agents):** `agent/crew-mcp` — tools `crew_discover` · `crew_autohire` · `crew_search_kols` · `crew_launch` · `crew_status` · `crew_wire_fees` · `crew_lock_holder_kol` · `crew_crank_remits` · `crew_proof`. Manifest: https://crewpay.dev/mcp.json · HTTP: https://mcp.crewpay.dev/mcp · skill: `skills/crewpay-crypto-agent` · reference: `scripts/reference-agent.mjs`.

**Buyback cron:** set `CREW_BUYBACK_MINT` + `CREW_BUYBACK_PRIVATE_KEY`; `CREW_BUYBACK_DRY_RUN=0` to execute Jupiter swaps (default dry-run outside production).

---

## Agent launch API

AI agents can launch Pump coins with CREW fee-shares (25% CREW buyback + hired KOL wallets) without the browser desk.

### Auth

| Header | Purpose |
|--------|---------|
| `x-crew-api-key` | **`CREW_AGENT_API_KEY`** (server-only). When set, the browser `CREW_API_KEY` / `VITE_CREW_API_KEY` is **rejected** on agent routes. |
| `x-launcher-key` | Agent’s Solana **secret key** (base58 or JSON byte array). Signs `createV2` + fee-share. **Never stored or logged.** |
| `x-idempotency-key` | Optional 8–128 chars — launch retries return the cached response for 15 minutes. |

Optional server fallback: set `CREW_AGENT_LAUNCHER_KEY` so trusted hosted agents can omit the launcher header (avoid in multi-tenant prod).

**Hardening:** SSRF-safe `imageUrl`, magic-byte image check, rate limits (autohire 30/min, launch 5/min per key), SOL balance preflight, `initialBuySol` max 10, `feeShareLocked` + HTTP 202 on partial fee-share.

### 1) Preview narrative Autohire

```bash
curl -sS https://api.crewpay.dev/api/agent/autohire \
  -H "content-type: application/json" \
  -H "x-crew-api-key: $CREW_AGENT_API_KEY" \
  -d '{
    "name": "Desk Cat",
    "ticker": "DCAT",
    "description": "ai agent hires kols for a trench meme",
    "seats": 5
  }'
```

Returns `{ match, hires, crew }` — no on-chain tx.

### 2) Launch

```bash
curl -sS https://api.crewpay.dev/api/agent/launch \
  -H "content-type: application/json" \
  -H "x-crew-api-key: $CREW_AGENT_API_KEY" \
  -H "x-launcher-key: $AGENT_SOLANA_SECRET" \
  -H "x-idempotency-key: desk-cat-1" \
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
      "model": "gpt"
    },
    "initialBuySol": 0
  }'
```

**Body fields**

| Field | Required | Notes |
|-------|----------|-------|
| `name` | yes | 2–32 chars |
| `ticker` | yes | 2–13 A–Z / 0–9 |
| `description` | no | max 204 user chars; appends “Launched from CrewPay.dev platform” (final ≤240) |
| `mode` | no | `split` \| `buyback` \| `raid` \| `agent` (default **agent**) |
| `imageUrl` **or** `imageBase64` | yes | PNG/JPEG/WebP ≤ 5MB |
| `autoHire.seats` | * | 1–10; used when `crew` omitted |
| `crew` | * | `[{ handle, wallet, share, hireRole? }]` totaling 100% |
| `agent` | for mode=agent | `{ name, objective, model? }` |
| `initialBuySol` | no | 0–10 |
| `holderKol` | no | skip crew; lock holders later on desk |

\* Provide `crew` **or** `autoHire` (or `holderKol: true`).

**Success (201)**

```json
{
  "ok": true,
  "mint": "...",
  "signature": "...",
  "feeShareSignature": "...",
  "pumpUrl": "https://pump.fun/coin/...",
  "launcher": "...",
  "crew": [...],
  "hirePlan": { "match": { "tags": ["ai", "..."] }, "hires": [...] },
  "coin": { ... }
}
```

Fee map (mode=`agent`): **25% CREW buyback** + **15% launcher ops** + **60% hired KOLs**.

---

## Local

```bash
cd agent/crew-api
cp .env.example .env   # DATABASE_URL + CREW_API_KEY + CREW_AGENT_API_KEY + CREW_BUYBACK_WALLET + RPC_URL
npm ci
npm run migrate
npm run seed:kols      # optional — UI KOL search
# ensure data/kol-db.json exists (copied on npm run build)
npm test
npm run dev
```

## Env (server-only — never `VITE_*` for secrets)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres |
| `CREW_API_KEY` | Board write auth (may match `VITE_CREW_API_KEY`) |
| `CREW_AGENT_API_KEY` | Agent Autohire/launch auth (server-only; required in prod) |
| `CREW_BUYBACK_WALLET` | 25% fee-share recipient (required for launches) |
| `RPC_URL` | Mainnet RPC for agent launches / buyback |
| `CREW_AGENT_LAUNCHER_KEY` | Optional shared launcher secret |
| `CREW_BUYBACK_PRIVATE_KEY` | Buyback cron only |
| `CREW_BUYBACK_MINT` | Buyback cron only |
| `CORS_ORIGINS` | Browser origins |

## Buyback cron secrets

- `CREW_BUYBACK_PRIVATE_KEY`
- `CREW_BUYBACK_MINT`
- `CREW_BUYBACK_MAX_SOL`
- `RPC_URL`
