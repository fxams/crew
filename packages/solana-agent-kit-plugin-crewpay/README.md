# @crewpay/solana-agent-kit-plugin

Solana Agent Kit v2 plugin for [CrewPay](https://crewpay.dev).

```ts
import { SolanaAgentKit } from 'solana-agent-kit'
import { CrewPayPlugin } from '@crewpay/solana-agent-kit-plugin'

const agent = new SolanaAgentKit(wallet, rpcUrl, config).use(CrewPayPlugin)
await agent.methods.crewDryRun({ name: 'Desk Cat', ticker: 'DCAT', autoHire: { seats: 3 } })
// human confirms…
await agent.methods.crewLaunch({ name: 'Desk Cat', ticker: 'DCAT', autoHire: { seats: 3 }, humanConfirmed: true })
```

## Safety

- Dry-run first; `humanConfirmed: true` required for launch
- Env keys only (`CREW_AGENT_API_KEY`, `CREW_LAUNCHER_KEY`)
- Fee map **60/15/25**; buyback cron not live yet

## Upstream

Contribution guide: https://github.com/sendaifun/solana-agent-kit/blob/main/CONTRIBUTING.md  
Kept in `packages/` until an upstream plugin PR lands.
