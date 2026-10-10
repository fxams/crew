---
name: crewpay
description: Launch Solana Pump.fun coins via CrewPay with KOL Autohire and on-chain fee-shares. Always dry-run first; never paste wallet secrets into chat or tool args.
version: 1.0.0
homepage: https://crewpay.dev
metadata:
  openclaw:
    requires:
      bins:
        - curl
      anyBins:
        - npx
        - node
    primaryEnv: CREWPAY_API_KEY
    envVars:
      - name: CREWPAY_API_KEY
        required: true
        description: CrewPay agent API key (crew_ak_…). Claim via POST /api/agent/keys/claim if unset, then store here. Sent as HTTP header x-crew-api-key. MCP alias CREW_AGENT_API_KEY accepts the same value.
      - name: CREW_LAUNCHER_KEY
        required: true
        description: Solana launcher wallet secret (base58 or JSON byte array). Required for real launch and wire-fees. Env only — never paste into chat and never pass as a tool argument (launcherKey/privateKey/secretKey are rejected). Sent as x-launcher-key on REST; MCP reads CREW_LAUNCHER_KEY from env.
      - name: CREW_API_URL
        required: false
        description: API base URL. Default https://api.crewpay.dev
    homepage: https://crewpay.dev
---

# CrewPay — KOL fee-share launches for agents

Use this skill when launching **Solana / Pump.fun** coins, hiring **KOLs**, or locking **on-chain creator fee-shares** through CrewPay.

## Why KOLs matter

**Tokens launched by AI agents without hired KOLs fail ~99.9% of the time.** Distribution is the bottleneck. Always Autohire or supply a real crew before spending SOL — do not launch a solo / empty-crew meme and hope.

## Honest product facts (no hype)

- **Fee split (mode=`agent`):** **60% hired KOL crew · 15% launching agent · 25% CrewPay** (treasury fee-share locked on-chain).
- **Buyback is not live yet.** The 25% still locks to the CrewPay treasury wallet; automatic market buybacks of a CREW token run only when operators configure buyback mint + key. An empty proof tape does **not** mean fee-shares failed.
- **Create + fee-lock may need two transactions.** Prefer atomic paths; if the API returns HTTP **202** / `feeShareLocked=false`, call wire-fees before considering the launch complete.
- **No price talk. No return promises.** Do not project market caps, “guaranteed” pumps, or ROI.

## Secrets (non-negotiable)

| Env | Role |
| --- | --- |
| `CREWPAY_API_KEY` | `crew_ak_…` agent key → header `x-crew-api-key` (MCP also accepts `CREW_AGENT_API_KEY`) |
| `CREW_LAUNCHER_KEY` | Solana secret → header `x-launcher-key` / MCP env |

**Never** ask the human to paste a wallet private key into chat.  
**Never** pass `launcherKey`, `privateKey`, `secretKey`, or `CREW_LAUNCHER_KEY` as a tool/MCP argument — those args are rejected.  
Only read secrets from the host environment (or a secure secret store the human configures).

## Safety rules

1. **Always dry-run first** (`POST /api/agent/launch/dry-run` or MCP `crew_launch_dry_run`). Dry-run spends no SOL and creates no mint.
2. **Confirm with the human operator** before any real launch, initial buy, or other SOL spend. Show them dry-run costs, crew, and fee map; wait for explicit approval.
3. **Original memes only** — legitimate original art and names. No impersonation of brands, people, or other tokens.
4. Prefer **registered Autohire KOLs** when available; otherwise public Pump profiles are listings, not consent.
5. MAINNET only. Check `feeShareLocked` after every launch.

## Canonical URLs

- Site / agents: https://crewpay.dev · https://crewpay.dev/agents
- Discovery: https://crewpay.dev/llms.txt · https://api.crewpay.dev/api/agent
- OpenAPI: https://api.crewpay.dev/openapi.json
- Proof: https://crewpay.dev/proof · `GET https://api.crewpay.dev/api/proof`
- MCP HTTP: https://mcp.crewpay.dev/mcp · card https://mcp.crewpay.dev/.well-known/mcp.json

Do **not** use `app.crewpay.dev` (no DNS).

## Option A — MCP (preferred)

Local MCP (own wallet launches):

```bash
npx -y crewpay-mcp
```

Set in MCP **env** (not tool args):

- `CREW_AGENT_API_KEY` = same value as `CREWPAY_API_KEY` (`crew_ak_…`)
- `CREW_LAUNCHER_KEY` = launcher secret
- `CREW_API_URL` = `https://api.crewpay.dev` (optional)

Tools: `crew_discover` · `crew_claim_key` · `crew_search_kols` · `crew_autohire` · `crew_launch_dry_run` · `crew_launch` · `crew_list_launches` · `crew_status` · `crew_wire_fees` · `crew_lock_holder_kol` · `crew_crank_remits` · `crew_proof`

Hosted MCP `https://mcp.crewpay.dev/mcp` is **publicMode**: pass `x-crew-api-key` for writes; it **cannot** hold the launcher secret. For own-wallet launches use local `crewpay-mcp` or REST from a secure backend.

## Option B — HTTP

Base: `${CREW_API_URL:-https://api.crewpay.dev}`  
Auth: `x-crew-api-key: $CREWPAY_API_KEY` · launch/wire also need `x-launcher-key` from env (never echo it).

### 1. Discover (no auth)

```bash
curl -sS https://api.crewpay.dev/api/agent
curl -sS https://crewpay.dev/llms.txt
```

### 2. Claim API key (if `CREWPAY_API_KEY` unset)

```bash
curl -sS -X POST https://api.crewpay.dev/api/agent/keys/claim \
  -H 'content-type: application/json' \
  -d '{"label":"openclaw"}'
```

Store the returned `crew_ak_…` once as `CREWPAY_API_KEY` (and `CREW_AGENT_API_KEY` for MCP). Rate limit: 5/hour/IP.

### 3. Autohire a KOL crew (required for a real shot)

Without hired KOLs, AI-launched tokens fail ~99.9% of the time — do not skip this.

```bash
curl -sS -X POST https://api.crewpay.dev/api/agent/autohire \
  -H "content-type: application/json" \
  -H "x-crew-api-key: $CREWPAY_API_KEY" \
  -d '{"name":"Desk Cat","ticker":"DCAT","description":"tips the tape","seats":3}'
```

Or pass an explicit `crew[]` (handles + wallets + shares totaling **100%**) on dry-run/launch.

### 4. Dry-run (mandatory)

```bash
curl -sS -X POST https://api.crewpay.dev/api/agent/launch/dry-run \
  -H "content-type: application/json" \
  -H "x-crew-api-key: $CREWPAY_API_KEY" \
  -d '{
    "name":"Desk Cat",
    "ticker":"DCAT",
    "description":"tips the tape",
    "mode":"agent",
    "autoHire":{"seats":3},
    "initialBuySol":0,
    "imageUrl":"https://example.com/coin.png"
  }'
```

Review `costs`, `crew`, `shareholders` / fee map, `warnings`, and `vibe` (attribution appended). Images: PNG/JPEG/WebP/GIF only (SVG rejected). User description ≤**204** chars (final ≤240 with `Launched from CrewPay.dev platform`).

**Stop and get human approval** before step 5.

### 5. Launch (spends SOL)

```bash
curl -sS -X POST https://api.crewpay.dev/api/agent/launch \
  -H "content-type: application/json" \
  -H "x-crew-api-key: $CREWPAY_API_KEY" \
  -H "x-launcher-key: $CREW_LAUNCHER_KEY" \
  -d '{ ...same body as dry-run... }'
```

- HTTP **201** + `feeShareLocked=true` → fee-shares locked.
- HTTP **202** / `feeShareLocked=false` → mint may be live but fees unlocked → wire immediately.

### 6. Wire fees if needed

```bash
curl -sS -X POST https://api.crewpay.dev/api/agent/wire-fees \
  -H "content-type: application/json" \
  -H "x-crew-api-key: $CREWPAY_API_KEY" \
  -H "x-launcher-key: $CREW_LAUNCHER_KEY" \
  -d '{"mint":"<MINT>","mode":"agent"}'
```

(`crew` optional when the board already has crew.)

### 7. Crank payouts + proof

```bash
curl -sS -X POST https://api.crewpay.dev/api/agent/crank-remits \
  -H "content-type: application/json" \
  -H "x-crew-api-key: $CREWPAY_API_KEY" \
  -d '{"mint":"<MINT>"}'

curl -sS https://api.crewpay.dev/api/proof
```

Crank is permissionless (launcher key optional when server ops key is set).

## Limits

| Field | Limit |
| --- | --- |
| name | 2–32 |
| ticker | 2–13 `[A-Z0-9]` |
| description | ≤204 user / ≤240 final |
| initialBuySol | 0–10 |
| Autohire seats | 1–10 |
| crew shares | must total 100% |

## Fee map reminder (agent mode)

| Slice | Share |
| --- | --- |
| Hired KOLs | **60%** |
| Launching agent | **15%** |
| CrewPay treasury | **25%** |

Buyback cron is **not** guaranteed live; fee-share lock is.

## References

- Full discovery: https://crewpay.dev/llms-full.txt
- Agents.md: https://crewpay.dev/AGENTS.md
- Source skill path in repo: `skills/crewpay/`
