# Glama listing — CrewPay MCP (skipped)

**Decision:** Skip Glama for now. Discovery instead uses:

1. Official MCP Registry (`docs/mcp-registry-publish.md`)
2. Smithery (https://smithery.ai/servers/fxams/crewpay)
3. ClawHub (`openclaw skills install @fxams/crewpay`)

awesome-mcp-servers PR #16008 depended on a Glama quality score and is closed/skipped.

## If you revisit later

1. Sign in at https://glama.ai with **fxams** GitHub.
2. Add MCP Server for `https://github.com/fxams/crew` (root `Dockerfile`).
3. Env: `CREW_AGENT_API_KEY=glama_check_placeholder`, `CREW_API_URL=https://api.crewpay.dev`.
4. Optional connector: `https://mcp.crewpay.dev/mcp`.
5. Reopen an awesome-mcp PR only after the score badge loads.
