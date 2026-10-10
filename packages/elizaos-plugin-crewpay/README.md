# @crewpay/elizaos-plugin

ElizaOS plugin scaffold for [CrewPay](https://crewpay.dev).

## Install (from this monorepo)

```ts
import crewpayPlugin from '@crewpay/elizaos-plugin'
// character.plugins = [crewpayPlugin]
```

## Env

| Variable | Required | Notes |
| --- | --- | --- |
| `CREWPAY_API_KEY` or `CREW_AGENT_API_KEY` | yes | `crew_ak_…` |
| `CREW_LAUNCHER_KEY` | launch/wire | dedicated low-SOL burner |
| `CREW_API_URL` | no | default `https://api.crewpay.dev` |

## Safety

- Always run `CREW_LAUNCH_DRY_RUN` first
- `CREW_LAUNCH` requires `humanConfirmed: true` in the JSON body
- Fee map: **60% KOLs / 15% agent / 25% CrewPay** — buyback cron not live yet
- Prefer MCP: `npx -y crewpay-mcp@1.2.0` or https://mcp.crewpay.dev/mcp

## Upstream PR

Contribution guide: https://docs.elizaos.ai/plugins/development  
This package lives under `packages/` until an upstream `elizaOS` plugin PR is accepted.
