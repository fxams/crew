# Glama listing — CrewPay MCP

**Blocker for awesome-mcp-servers #16008:** Glama page `https://glama.ai/mcp/servers/fxams/crew` is currently **404** (no score). The PR already has emoji + badge markup; merge waits on a scored Glama evaluation.

## Operator steps (GitHub OAuth required)

1. Sign in at https://glama.ai with the **fxams** GitHub account (write access to `fxams/crew`).
2. **Add MCP Server** from GitHub: https://github.com/fxams/crew  
   - Display name: `crewpay` / `CREW / CrewPay`  
   - Description: Solana Pump.fun launches with KOL Autohire and on-chain fee-shares (60% KOL / 15% agent / 25% CrewPay). Buyback cron not live yet. Always dry-run first.
3. Point the build at the **root Dockerfile** (or `agent/crew-mcp/Dockerfile`).  
   Env for introspection: `CREW_AGENT_API_KEY=glama_check_placeholder`, `CREW_API_URL=https://api.crewpay.dev`.
4. Deploy / run health + introspection checks until a **quality score** appears.
5. Optional **Connector** listing for hosted MCP: https://mcp.crewpay.dev/mcp (streamable-http). Pass a test `x-crew-api-key` if Glama needs write introspection.
6. Confirm badge URL resolves:  
   `https://glama.ai/mcp/servers/fxams/crew/badges/score.svg`
7. Ping https://github.com/punkpeye/awesome-mcp-servers/pull/16008 after the score is live.

Repo already has `glama.json` (maintainers: `fxams`) and Dockerfiles for stdio startup.
