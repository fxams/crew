# Smithery — CrewPay

**Status:** Live at https://smithery.ai/servers/fxams/crewpay  

Part of the **primary** discovery trio (Official Registry + Smithery + ClawHub).

## Re-publish / refresh (operator)

```bash
npx @smithery/cli auth login
npx @smithery/cli mcp publish "https://mcp.crewpay.dev/mcp" -n fxams/crewpay \
  --config-schema '{"type":"object","properties":{"apiKey":{"type":"string","description":"CREW agent API key (x-crew-api-key)"}},"required":["apiKey"]}'
```

Stdio install uses pinned `npx -y crewpay-mcp@1.2.0` via root `smithery.yaml`.
