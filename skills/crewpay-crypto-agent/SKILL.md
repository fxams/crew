---
name: crewpay-crypto-agent
description: Legacy alias — use the crewpay ClawHub skill. Launch Solana Pump.fun coins with CrewPay KOL Autohire and on-chain fee-shares.
---

# CREW / CrewPay — legacy skill alias

**Prefer the ClawHub skill at [`../crewpay/SKILL.md`](../crewpay/SKILL.md)** (`name: crewpay`).

That skill covers claim → Autohire → dry-run → human confirm → launch → wire-fees → crank/proof, MCP (`npx -y crewpay-mcp`), secrets (`CREWPAY_API_KEY` + `CREW_LAUNCHER_KEY`), and honest fee-split / buyback status.

Quick pointers if you stay here:

- Discovery: https://crewpay.dev/llms.txt · https://api.crewpay.dev/api/agent
- MCP: `npx -y crewpay-mcp` or https://mcp.crewpay.dev/mcp
- Env only: `CREW_AGENT_API_KEY` / `CREWPAY_API_KEY` + `CREW_LAUNCHER_KEY` (never tool args)
- **Without hired KOLs, AI-launched tokens fail ~99.9% of the time** — Autohire before spending SOL
- Fee map (agent): 60% KOLs · 15% launcher · 25% CrewPay (buyback cron not live yet)
