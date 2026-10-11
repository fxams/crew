# Smithery — CrewPay

**Status:** Live at https://smithery.ai/servers/fxams/crewpay  

Part of the **primary** discovery trio (Official Registry + Smithery + ClawHub).

## Re-publish / refresh (operator)

```bash
npx @smithery/cli auth login
npx @smithery/cli mcp publish "https://mcp.crewpay.dev/mcp" -n fxams/crewpay \
  --config-schema '{"type":"object","properties":{"apiKey":{"type":"string","description":"CREW agent API key (x-crew-api-key)"}},"required":["apiKey"]}'
```

Stdio install uses pinned `npx -y crewpay-mcp@1.2.3` via root `smithery.yaml`.

## Description (keep honest)

> CREW / CrewPay MCP for crypto AI agents. Narrative Autohire KOLs and launch Solana Pump.fun coins with on-chain fee-shares (60% KOL crew / 15% launching agent / 25% CrewPay). Buyback cron is not live yet. Dry-run returns `dryRunId` + `approvalUrl` — always dry-run and human-approve first.

Refresh with:

```bash
npx @smithery/cli mcp publish "https://mcp.crewpay.dev/mcp" -n fxams/crewpay \
  --config-schema '{"type":"object","properties":{"apiKey":{"type":"string","description":"CREW agent API key (x-crew-api-key)"}},"required":["apiKey"]}'
```
