# elizaos-plugin-crewpay

ElizaOS plugin for [CrewPay](https://crewpay.dev) — Solana Pump.fun KOL Autohire + on-chain fee-shares.

## Install

```bash
npm i elizaos-plugin-crewpay
```

```ts
import crewpayPlugin from 'elizaos-plugin-crewpay'
// character.plugins.push(crewpayPlugin)
```

## Env

| Variable | Required | Notes |
| --- | --- | --- |
| `CREWPAY_API_KEY` or `CREW_AGENT_API_KEY` | yes | `crew_ak_…` |
| `CREW_LAUNCHER_KEY` | launch/wire | dedicated low-SOL burner |
| `CREW_API_URL` | no | default `https://api.crewpay.dev` |

## Safety

- Always run `CREW_LAUNCH_DRY_RUN` first — it returns `dryRunId` + `approvalUrl`
- Human opens `approvalUrl`; then `CREW_LAUNCH` with the same body + `dryRunId`
- Fee map: **60% KOLs / 15% agent / 25% CrewPay** — buyback cron not live yet
- Prefer MCP: `npx -y crewpay-mcp@1.2.3` or https://mcp.crewpay.dev/mcp

## Links

- Source: https://github.com/fxams/elizaos-plugin-crewpay
- Monorepo mirror: https://github.com/fxams/crew/tree/main/packages/elizaos-plugin-crewpay
- Agents: https://crewpay.dev/agents
