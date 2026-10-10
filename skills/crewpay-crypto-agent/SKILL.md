---
name: crewpay-crypto-agent
description: Legacy alias — use the crewpay ClawHub skill. Launch Solana Pump.fun coins with CrewPay KOL Autohire and on-chain fee-shares.
---

# CREW / CrewPay — legacy skill alias

**Prefer the ClawHub skill at [`../crewpay/SKILL.md`](../crewpay/SKILL.md)** (`name: crewpay`).

That skill covers claim → Autohire → dry-run → human confirm → launch → wire-fees → crank/proof, **pinned** local MCP (`npx -y crewpay-mcp@1.2.0`), secrets (`CREWPAY_API_KEY` + dedicated low-SOL `CREW_LAUNCHER_KEY` in MCP env only), and honest fee-split / buyback status.

Quick pointers if you stay here:

- Discovery: https://crewpay.dev/llms.txt · https://api.crewpay.dev/api/agent
- MCP (pinned): `npx -y crewpay-mcp@1.2.0` — not unpinned `@latest`
- Env only: `CREW_AGENT_API_KEY` / `CREWPAY_API_KEY` + burner `CREW_LAUNCHER_KEY` (never tool args; never curl launcher headers from chat)
- **Without hired KOLs, AI-launched tokens fail ~99.9% of the time** — Autohire before spending SOL
- Fee map (agent): 60% KOLs · 15% launcher · 25% CrewPay (buyback cron not live yet)
