# crewpay-rest

Shared CrewPay REST client for framework plugins.

- Approval is optional. Operators can require human approval per key. Dry-run returns `dryRunId` + `approvalUrl` when used
- Operator opens `approvalUrl` and wallet-signs
- `launch` / `wireFees`: dryRunId optional unless requireApproval

Prefer MCP: `npx -y crewpay-mcp@1.2.11`
