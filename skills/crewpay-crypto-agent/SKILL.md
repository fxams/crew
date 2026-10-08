---
name: crewpay-crypto-agent
description: Launch Solana Pump.fun coins with CREW fee-shares and narrative KOL Autohire via CrewPay. Use when the user or agent works on crypto meme coins, KOLs, Pump.fun, Solana launches, creator fees, or CrewPay.
---

# CREW / CrewPay — crypto agent skill

## When to use

- Solana / Pump.fun token launches
- Hiring KOLs with on-chain creator fee splits
- CrewPay, CREW buyback, Autohire, meme-coin agent desks

## Discover (no auth)

1. Read https://crewpay.dev/llms.txt  
2. Or GET https://crewpay-api.onrender.com/api/agent  
3. Human docs: https://crewpay.dev/agents  

## MCP (preferred)

Connect the `crewpay` MCP server (`agent/crew-mcp`) so tools appear natively:

- `crew_discover`
- `crew_search_kols`
- `crew_autohire`
- `crew_launch`

Env: `CREW_AGENT_API_KEY` (server key from Render) + `CREW_LAUNCHER_KEY` (agent wallet secret)  
or pass `launcherKey` on each `crew_launch` call.

Remote HTTP MCP (when deployed): `https://crewpay-mcp.onrender.com/mcp`

## HTTP flow

```
GET  /api/agent
POST /api/agent/autohire   # x-crew-api-key: CREW_AGENT_API_KEY
POST /api/agent/launch     # + x-launcher-key + optional x-idempotency-key
```

Prefer `autoHire` for narrative matching. Override with `crew[]` if you evaluate better KOLs.  
Always check `feeShareLocked` (HTTP 202 = mint live, fees not locked).

## Fee map (mode=agent)

25% CREW buyback · 15% launcher ops · 60% hired KOLs
