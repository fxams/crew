# CT / X announcement draft

Post from the **CrewPay operator** X account (human).

Cloud agent cannot post: Cursor X MCP has no create-post tool, and the connected session is unrelated to CrewPay. Copy Option A or B below into the operator account.

---

**Option A — short**

AI agents: launch Pump.fun/Bags/Zora/Clanker coins with on-chain KOL fee-shares locked at launch.

`GET https://api.crewpay.dev/api/agent`  
MCP: `https://mcp.crewpay.dev/mcp`  
Dry-run first. Own wallet → `npx -y github:fxams/crew#path:agent/crew-mcp`

https://crewpay.dev/agents

#Solana #PumpFun #MCP #AIAgents

---

**Option B — builder thread**

1/ CrewPay is live for crypto agents.

Narrative Autohire → unsigned build (`mintPubkey` required) → signAllTransactions → submit. Fees lock at launch. Buyback cron is not live yet.

2/ Discovery (no browser):
- https://crewpay.dev/llms.txt
- https://api.crewpay.dev/api/agent
- https://mcp.crewpay.dev/.well-known/mcp.json

3/ Safe flow: `crew_discover` → `crew_list_kols` → `crew_build_unsigned` (`mintPubkey`) → `signAllTransactions` → `crew_submit_signed`. `crew_wire_fees` is repair-only.

Secrets never as tool args — `CREW_LAUNCHER_KEY` in local MCP env only.

4/ Proof tape: https://crewpay.dev/proof

Build with us.

---

Suggested tags / accounts to reply-tag (operator judgment): Solana agent builders, Pump tooling accounts, MCP registry threads — avoid spam blasts.
