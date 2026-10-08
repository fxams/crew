---
name: crewpay-crypto-agent
description: Launch Solana Pump.fun coins with CREW fee-shares and narrative KOL Autohire via CrewPay. Use when the user or agent works on crypto meme coins, KOLs, Pump.fun, Solana launches, creator fees, buybacks, or CrewPay.
---

# CREW / CrewPay — crypto agent skill

## When to use

- Solana / Pump.fun token launches
- Hiring KOLs with on-chain creator fee splits
- CrewPay, CREW buyback, Autohire, meme-coin agent desks
- Repairing unlocked fee-shares / Holder KOL locks / cranking remits

## Discover (no auth)

1. Read https://crewpay.dev/llms.txt  
2. Or GET https://api.crewpay.dev/api/agent  
3. Human docs: https://crewpay.dev/agents  
4. Proof tape: https://crewpay.dev/proof · GET https://api.crewpay.dev/api/proof  
5. MCP card: https://mcp.crewpay.dev/.well-known/mcp.json  

Canonical site: **https://crewpay.dev** (`app.crewpay.dev` has no DNS — do not use it).

## MCP (preferred)

Install local MCP (own wallet):

```bash
npx -y github:fxams/crew#path:agent/crew-mcp
```

Or clone → `agent/crew-mcp`. Tools:

- `crew_discover` · `crew_claim_key` · `crew_search_kols` · `crew_autohire` · `crew_launch_dry_run` · `crew_launch`
- `crew_status` · `crew_wire_fees` · `crew_lock_holder_kol` · `crew_crank_remits` · `crew_proof`

**Env only — tool args `launcherKey` / `privateKey` / `secretKey` are rejected:**

- `CREW_AGENT_API_KEY` — `crew_ak_…` from `crew_claim_key` / `POST /api/agent/keys/claim` (self-serve) or operator key
- `CREW_LAUNCHER_KEY` — agent Solana secret
- `CREW_API_URL` — optional, default `https://api.crewpay.dev`

Remote HTTP MCP: `https://mcp.crewpay.dev/mcp` (publicMode: pass `x-crew-api-key` for writes).  
**Own wallet launches:** local `crewpay-mcp` with env keys, or REST with `x-launcher-key` from your secure backend — the public hosted MCP cannot launch with your wallet.

## Safe flow

```
GET  /api/agent
POST /api/agent/keys/claim          # or MCP crew_claim_key — self-serve crew_ak_… (5/hour/IP)
POST /api/agent/autohire            # + x-crew-api-key
POST /api/agent/launch/dry-run      # validates PNG/JPEG/WebP/GIF (not SVG); shows attribution
POST /api/agent/launch             # + x-launcher-key (prefers atomic create+fee-lock)
GET  /api/agent/status/:mint
POST /api/agent/wire-fees          # if feeShareLocked=false (HTTP 202)
…
```

Descriptions: user ≤**204** chars; appends `Launched from CrewPay.dev platform` (final ≤240). See dry-run `vibe` / `attribution`.  
Crew shares must total **100%**. Always check `feeShareLocked`. Autohire = public Pump profiles, not consent.

## Fee map (mode=agent)

25% CREW buyback · 15% launcher ops · 60% hired KOLs
