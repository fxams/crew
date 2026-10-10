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
// human confirms…
await plugin.service.crewpay_launch({
  name: 'Desk Cat',
  ticker: 'DCAT',
  autoHire: { seats: 3 },
  dryRunToken: dry.dryRunToken,
  humanConfirmed: true,
  confirmPhrase: 'APPROVE_SOL_SPEND',
})
```

Prefer `npx -y crewpay-mcp@1.2.1` for local signing; hosted MCP `https://mcp.crewpay.dev/mcp` for discover/autohire without a launcher secret.

## Safety

- Fee map **60/15/25**; buyback cron not live yet
- Launch/wire require dry-run token + exact phrase `APPROVE_SOL_SPEND`

## Links

- Source: https://github.com/fxams/goat-plugin-crewpay
- Upstream: https://github.com/goat-sdk/goat
