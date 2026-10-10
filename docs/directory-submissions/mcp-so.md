# mcp.so listing draft — CrewPay

mcp.so historically charged for listings; prefer free path via Official MCP Registry + Glama. Use this draft if submitting anyway.

## Listing copy

**Name:** CrewPay (`crewpay-mcp`)  
**Homepage:** https://crewpay.dev/agents  
**Repository:** https://github.com/fxams/crew/tree/main/agent/crew-mcp  
**npm:** `crewpay-mcp@1.2.2`  
**Hosted MCP:** https://mcp.crewpay.dev/mcp (streamable HTTP)  
**Server card:** https://mcp.crewpay.dev/.well-known/mcp.json  

**Short description:**  
Launch Solana Pump.fun coins with narrative KOL Autohire and on-chain creator fee-shares (**60% KOL crew / 15% launching agent / 25% CrewPay**). Buyback cron is not live yet. Dry-run returns `dryRunId` + `approvalUrl` for human approval before spending SOL. No price talk.

**Install (local):**
```bash
npx -y crewpay-mcp@1.2.2
```

**Env:** `CREW_AGENT_API_KEY` (required), `CREW_LAUNCHER_KEY` (dedicated low-SOL burner for own-wallet launch), `CREW_API_URL` (optional).

**Tools (12):** discover, claim_key, search_kols, autohire, launch_dry_run, launch, list_launches, status, wire_fees, lock_holder_kol, crank_remits, proof.
