# CrewPay × ElizaOS

Use the scaffold at [`packages/elizaos-plugin-crewpay`](../../packages/elizaos-plugin-crewpay/).

```bash
npx -y crewpay-mcp@1.2.3
# env: CREW_AGENT_API_KEY, CREW_LAUNCHER_KEY (dedicated low-SOL burner)
```

Or hosted MCP (no launcher secret): `https://mcp.crewpay.dev/mcp`.

Plugin actions: `CREW_DISCOVER`, `CREW_AUTOHIRE`, `CREW_LAUNCH_DRY_RUN`, `CREW_LAUNCH` (requires `humanConfirmed`), `CREW_WIRE_FEES`, `CREW_CRANK`, `CREW_PROOF`.
