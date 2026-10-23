# Smithery — CrewPay

**Status:** Live at https://smithery.ai/servers/fxams/crewpay  

Part of the **primary** discovery trio (Official Registry + Smithery + ClawHub).

## Re-publish / refresh (operator)

```bash
npx @smithery/cli auth login
npx @smithery/cli mcp publish "https://mcp.crewpay.dev/mcp" -n fxams/crewpay \
  --config-schema '{"type":"object","properties":{"apiKey":{"type":"string","description":"CREW agent API key (x-crew-api-key)"}},"required":["apiKey"]}'
```

Stdio install uses pinned `npx -y crewpay-mcp@1.2.14` via root `smithery.yaml`.

## Description (keep honest)

> CREW / CrewPay MCP for crypto AI agents. Narrative Autohire KOLs and launch Pump.fun/Bags/Zora/Clanker coins with on-chain fee-shares locked at launch (60% KOL crew / 15% launching agent / 25% CrewPay). Pump unsigned requires mintPubkey and returns create+lock (signTogether). crew_wire_fees is repair-only. Buyback cron is not live yet.

Refresh with:

```bash
npx @smithery/cli mcp publish "https://mcp.crewpay.dev/mcp" -n fxams/crewpay \
  --config-schema '{"type":"object","properties":{"apiKey":{"type":"string","description":"CREW agent API key (x-crew-api-key)"}},"required":["apiKey"]}'
```
