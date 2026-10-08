# CREW / CrewPay — for AI agents (especially crypto)

You are looking at the agent entrypoint for **CrewPay**: launch Solana **Pump.fun** coins, **Autohire KOLs** by narrative, lock **on-chain creator fee-shares** (25% CREW buyback), crank remits, and verify the public proof tape.

## Start here

- Discovery index: [/llms.txt](https://crewpay.dev/llms.txt)
- Full instructions: [/llms-full.txt](https://crewpay.dev/llms-full.txt)
- OpenAPI: [/openapi.json](https://crewpay.dev/openapi.json)
- MCP manifest: [/mcp.json](https://crewpay.dev/mcp.json)
- Agent card: [/.well-known/agent.json](https://crewpay.dev/.well-known/agent.json)
- Human UI docs: [/agents](https://crewpay.dev/agents)
- Proof tape: [/proof](https://crewpay.dev/proof)
- API: [https://api.crewpay.dev/api/agent](https://api.crewpay.dev/api/agent)
- Proof API: [https://api.crewpay.dev/api/proof](https://api.crewpay.dev/api/proof)

Canonical site: **https://crewpay.dev** (`app.crewpay.dev` has no DNS — do not use it).

Legacy aliases (still valid): `https://crewpay-api.onrender.com` · `https://crewpay-mcp.onrender.com/mcp`

## Safe agent flow

1. `crew_claim_key` / `POST /api/agent/keys/claim` — self-serve `crew_ak_…` (no operator signup)
2. `crew_discover` / `GET /api/agent`
3. `crew_autohire` — preview public Pump profiles (not opt-in partners)
4. `crew_launch_dry_run` / `POST /api/agent/launch/dry-run` — validate + estimate SOL (no mint)
5. `crew_launch` — **mainnet**; prefers atomic create+fee-lock; secrets only in MCP env (`CREW_AGENT_API_KEY`, `CREW_LAUNCHER_KEY`)
6. If `feeShareLocked=false` (HTTP 202) → `crew_wire_fees` or `crew_lock_holder_kol`
7. `crew_proof` to verify the tape

## Description attribution

Every launch appends **Launched from CrewPay.dev platform** when missing. Keep user `description` ≤**204** characters so the final on-chain vibe is ≤240. Dry-run returns `vibe` (final) and `attribution`. Images: PNG/JPEG/WebP/GIF only (SVG rejected).

## Own wallet / local MCP

Hosted MCP `https://mcp.crewpay.dev/mcp` is **publicMode**: pass `x-crew-api-key` for writes; it cannot hold your launcher secret.

```bash
npx -y github:fxams/crew#path:agent/crew-mcp
```

Or clone the repo → `cd agent/crew-mcp && npm ci && npm run build`, then point your MCP client at `dist/index.js` with env:

- `CREW_AGENT_API_KEY`
- `CREW_LAUNCHER_KEY` (Solana secret — **never** a tool argument)
- `CREW_API_URL=https://api.crewpay.dev`

REST alternative: `POST https://api.crewpay.dev/api/agent/launch` with `x-launcher-key` from your backend.

## MCP tools

Install `crewpay-mcp` as above, or connect HTTP MCP at `https://mcp.crewpay.dev/mcp`.

Tools: `crew_discover` · `crew_claim_key` · `crew_search_kols` · `crew_autohire` · `crew_launch_dry_run` · `crew_launch` · `crew_status` · `crew_wire_fees` · `crew_lock_holder_kol` · `crew_crank_remits` · `crew_proof`

## Auth + keys

- Self-serve: `crew_claim_key` or `POST /api/agent/keys/claim` → `crew_ak_…` once (5/hour/IP). Operator mint: `POST /api/agent/keys` (requires an existing key).
- Put the Solana secret in `CREW_LAUNCHER_KEY` MCP env — **never** as a tool argument (`launcherKey` / `privateKey` / `secretKey` are rejected).
- Hosted MCP writes require `x-crew-api-key`; local stdio uses env keys.

## Limits (aligned)

Name 2–32 · ticker 2–13 · description ≤204 user / ≤240 final · initial buy 0–10 SOL · seats 1–10 · crew shares must total 100%.

## Keywords

solana, pump.fun, meme coin, KOL, creator fees, fee-share, CrewPay, CREW, autohire, buyback, AI agent launch, crypto agent
