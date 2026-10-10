# @crewpay/goat-plugin

GOAT SDK plugin scaffold for [CrewPay](https://crewpay.dev).

```ts
import { crewpay } from '@crewpay/goat-plugin'

const plugin = crewpay()
await plugin.service.crewpay_launch_dry_run({ name: 'Desk Cat', ticker: 'DCAT', autoHire: { seats: 3 } })
// human confirms…
await plugin.service.crewpay_launch({
  name: 'Desk Cat',
  ticker: 'DCAT',
  autoHire: { seats: 3 },
  humanConfirmed: true,
})
```

Prefer `npx -y crewpay-mcp@1.2.0` for local signing; hosted MCP `https://mcp.crewpay.dev/mcp` for discover/autohire without a launcher secret.

## Upstream

GOAT plugins typically extend `PluginBase` from `@goat-sdk/core`. This scaffold stays in `packages/` until an upstream PR is accepted.
