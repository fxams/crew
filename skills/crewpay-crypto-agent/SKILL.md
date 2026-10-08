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

## MCP (preferred)

Connect the `crewpay` MCP server (`agent/crew-mcp`) so tools appear natively:

- `crew_discover` · `crew_search_kols` · `crew_autohire` · `crew_launch_dry_run` · `crew_launch`
- `crew_status` · `crew_wire_fees` · `crew_lock_holder_kol` · `crew_crank_remits` · `crew_proof`

**Env only (never tool args):**

- `CREW_AGENT_API_KEY` — server/operator key (or mint `crew_ak_…` via `POST /api/agent/keys`)
- `CREW_LAUNCHER_KEY` — agent Solana secret
- `CREW_API_URL` — optional, default `https://api.crewpay.dev`

Remote HTTP MCP: `https://mcp.crewpay.dev/mcp`

## Safe flow

```
GET  /api/agent
POST /api/agent/autohire                 # x-crew-api-key
POST /api/agent/launch/dry-run           # no SOL, no launcher secret
POST /api/agent/launch                   # + x-launcher-key + optional x-idempotency-key
GET  /api/agent/status/:mint
POST /api/agent/wire-fees                # if feeShareLocked=false
POST /api/agent/lock-holder-kol          # when holderKol=true
POST /api/agent/crank
GET  /api/proof
POST /api/webhooks
POST /api/agent/keys
```

Prefer `autoHire` for narrative matching. Override with `crew[]` (shares must total **100%**).  
Always check `feeShareLocked` (HTTP 202 = mint live, fees not locked → wire or lock-holder-kol).  
Autohire wallets are **public Pump profiles**, not consenting partners — confirm with the operator.

## Limits

Name 2–32 · ticker 2–13 · description ≤240 · initialBuySol 0–10 · seats 1–10 · **mainnet only**

## Fee map (mode=agent)

25% CREW buyback · 15% launcher ops · 60% hired KOLs
