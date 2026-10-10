# CrewPay × ElizaOS

Wire CrewPay into an Eliza character via MCP or HTTP.

```bash
npx -y crewpay-mcp
# env: CREW_AGENT_API_KEY, CREW_LAUNCHER_KEY (local only)
```

Or point the character at hosted MCP discover/autohire: `https://mcp.crewpay.dev/mcp`.

Planned plugin export: `crewpayPlugin` with actions `CREW_CLAIM_KEY`, `CREW_AUTOHIRE`, `CREW_LAUNCH_DRY_RUN`, `CREW_LAUNCH`.
