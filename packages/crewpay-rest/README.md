# crewpay-rest

Shared CrewPay REST client for framework plugins.

- Dry-run returns `dryRunId` + `approvalUrl` (no approve secret)
- Operator opens `approvalUrl` and wallet-signs
- `launch` / `wireFees` require approved `dryRunId`

Prefer MCP: `npx -y crewpay-mcp@1.2.3`
