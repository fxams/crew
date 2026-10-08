# CREW API

Postgres-backed API for CREW launches, remits, KOL directory, buyback cron, and **agent launch**.

Production: https://crewpay-api.onrender.com

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
| POST | `/api/agent/autohire` | `x-crew-api-key` |
| POST | `/api/agent/launch` | `x-crew-api-key` + `x-launcher-key` |

---

## Agent launch API

AI agents can launch Pump coins with CREW fee-shares (25% CREW buyback + hired KOL wallets) without the browser desk.

### Auth

| Header | Purpose |
|--------|---------|
| `x-crew-api-key` | Platform key (`CREW_API_KEY`) |
| `x-launcher-key` | Agent’s Solana **secret key** (base58 or JSON byte array). Signs `createV2` + fee-share. **Never stored or logged.** |

Optional server fallback: set `CREW_AGENT_LAUNCHER_KEY` so trusted hosted agents can omit the header.

### 1) Preview narrative Autohire

```bash
curl -sS https://crewpay-api.onrender.com/api/agent/autohire \
  -H "content-type: application/json" \
  -H "x-crew-api-key: $CREW_API_KEY" \
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
curl -sS https://crewpay-api.onrender.com/api/agent/launch \
  -H "content-type: application/json" \
  -H "x-crew-api-key: $CREW_API_KEY" \
  -H "x-launcher-key: $AGENT_SOLANA_SECRET" \
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
| `description` | no | max 240; CREW attribution appended |
| `mode` | no | `split` \| `buyback` \| `raid` \| `agent` (default **agent**) |
| `imageUrl` **or** `imageBase64` | yes | PNG/JPEG/WebP ≤ 5MB |
| `autoHire.seats` | * | 1–10; used when `crew` omitted |
| `crew` | * | `[{ handle, wallet, share, hireRole? }]` totaling 100% |
| `agent` | for mode=agent | `{ name, objective, model? }` |
| `initialBuySol` | no | 0–100 |
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
cp .env.example .env   # DATABASE_URL + CREW_API_KEY + CREW_BUYBACK_WALLET + RPC_URL
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
| `CREW_API_KEY` | Write + agent API auth |
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
