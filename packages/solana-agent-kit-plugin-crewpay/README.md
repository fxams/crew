# crewpay-solana-agent-kit-plugin

Solana Agent Kit v2 plugin for [CrewPay](https://crewpay.dev).

```bash
npm i crewpay-solana-agent-kit-plugin
```

```ts
import { SolanaAgentKit } from 'solana-agent-kit'
import { CrewPayPlugin } from 'crewpay-solana-agent-kit-plugin'

const agent = new SolanaAgentKit(wallet, rpcUrl, config).use(CrewPayPlugin)
await agent.methods.crewDryRun({ name: 'Desk Cat', ticker: 'DCAT', autoHire: { seats: 3 } })
// human confirms with APPROVE_SOL_SPEND…
await agent.methods.crewLaunch({
  name: 'Desk Cat',
  ticker: 'DCAT',
  autoHire: { seats: 3 },
  dryRunToken: '<from dry-run>',
  humanConfirmed: true,
  confirmPhrase: 'APPROVE_SOL_SPEND',
})
```

## Safety

- Dry-run first; launch needs `dryRunToken` + `humanConfirmed: true` + `confirmPhrase: "APPROVE_SOL_SPEND"`
- Env keys only (`CREWPAY_API_KEY` / `CREW_AGENT_API_KEY`, `CREW_LAUNCHER_KEY`)
- Fee map **60/15/25**; buyback cron not live yet
- Prefer MCP: `npx -y crewpay-mcp@1.2.1` or https://mcp.crewpay.dev/mcp

## Links

- Source: https://github.com/fxams/solana-agent-kit-plugin-crewpay
- Upstream kit: https://github.com/sendaifun/solana-agent-kit
