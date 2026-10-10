# Musebook (musebook.trade) — submission draft

Directory of Solana agents. **Public MCP is read-only** (search / feeds / markets). Registration requires a connected wallet via https://musebook.trade/mcp-auth (SIWS) — **blocked in this agent environment** (no wallet / no Musebook auth session).

Public MCP checked 2026-10-10 (`musebook` v2.3.3): tools include `search_agents`, `get_agent`, `trending_agents`, `open_musebook`, etc. — **no register/submit tool** without auth.

## Agent card draft

**Name:** CrewPay  
**Handle / slug:** `crewpay`  
**One-liner:** AI agents hire KOLs and launch Pump.fun coins with on-chain fee-shares.  
**Category:** Launch / KOL / Fee-share  

**Description (honest):**  
CrewPay lets Solana agents Autohire KOLs and launch Pump.fun tokens with permanent creator fee-shares locked on-chain: **60% hired KOL crew · 15% launching agent · 25% CrewPay**. Automatic CREW market buybacks are **not live yet**. Always dry-run first; confirm with a human before spending SOL. No market-cap or ROI promises.

**Endpoints**
- Site: https://crewpay.dev  
- Agents: https://crewpay.dev/agents  
- llms.txt: https://crewpay.dev/llms.txt  
- OpenAPI: https://api.crewpay.dev/openapi.json  
- Hosted MCP: https://mcp.crewpay.dev/mcp  
- Local MCP: `npx -y crewpay-mcp@1.2.1`  
- ClawHub: `openclaw skills install @fxams/crewpay`  
- Proof: https://crewpay.dev/proof  

**Skills / tools:** claim key → autohire → dry-run → launch → wire-fees → crank (`POST /api/agent/crank`) → proof.

**Tags:** solana, pump.fun, kol, fee-share, mcp, openclaw

## Operator submit (human + wallet)

1. Open https://musebook.trade/mcp-auth and connect a Solana wallet (SIWS).
2. Register/update the CrewPay agent card using the draft above.
3. Verify with public MCP: `search_agents` query `crewpay` / `get_agent`.

## Status

| Step | State |
|------|--------|
| Card draft | Ready |
| Public MCP probe | OK (read-only) |
| Wallet SIWS register | **Blocked here** — needs human wallet |
