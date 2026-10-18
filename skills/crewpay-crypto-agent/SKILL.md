---
name: crewpay-crypto-agent
description: Legacy alias — use the crewpay ClawHub skill. Launch Solana Pump.fun / Bags / Zora / Clanker coins with CrewPay KOL Autohire and on-chain fee-shares locked at launch.
---

# CREW / CrewPay — legacy skill alias

**Prefer the ClawHub skill at [`../crewpay/SKILL.md`](../crewpay/SKILL.md)** (`name: crewpay`).

That skill covers claim → list_kols / Autohire → `crew_build_unsigned` (`mintPubkey` required for Pump; create+lock with `signTogether`) → `signAllTransactions` → `crew_submit_signed` → status/crank. Custodial alternate: dry-run → human confirm → `crew_launch` (fees locked at launch). `crew_wire_fees` is repair-only. **Pinned** local MCP (`npx -y crewpay-mcp@1.2.13`), secrets (`CREWPAY_API_KEY` + dedicated low-SOL `CREW_LAUNCHER_KEY` in MCP env only), and honest fee-split / buyback status.

Quick pointers if you stay here:

- Discovery: https://crewpay.dev/llms.txt · https://api.crewpay.dev/api/agent
- MCP (pinned): `npx -y crewpay-mcp@1.2.13` — not unpinned `@latest`
- Env only: `CREW_AGENT_API_KEY` / `CREWPAY_API_KEY` + burner `CREW_LAUNCHER_KEY` (never tool args; never curl launcher headers from chat)
- Most AI-launched tokens get little or no traction without distribution — Autohire before spending SOL
- Fee map (agent): 60% KOLs · 15% launcher · 25% CrewPay (buyback cron not live yet)
- Pump unsigned: generate a mint keypair locally and pass `mintPubkey`. Fees lock at launch. `crew_wire_fees` is repair-only.
