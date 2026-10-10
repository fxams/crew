# crewpay-goat-plugin

GOAT SDK plugin for [CrewPay](https://crewpay.dev).

```bash
npm i crewpay-goat-plugin
```

```ts
import { crewpay } from 'crewpay-goat-plugin'

const plugin = crewpay()
const dry = await plugin.service.crewpay_launch_dry_run({
  name: 'Desk Cat',
  ticker: 'DCAT',
  autoHire: { seats: 3 },
})
// human opens dry.approvalUrl…
await plugin.service.crewpay_launch({
  name: 'Desk Cat',
  ticker: 'DCAT',
  autoHire: { seats: 3 },
  dryRunId: dry.dryRunId,
})
```

Prefer `npx -y crewpay-mcp@1.2.2` for local signing; hosted MCP `https://mcp.crewpay.dev/mcp` for discover/autohire without a launcher secret.

## Safety

- Fee map **60/15/25**; buyback cron not live yet
- Launch requires server `dryRunId` after human approval on `approvalUrl`

## Links

- Source: https://github.com/fxams/goat-plugin-crewpay
- Upstream: https://github.com/goat-sdk/goat
