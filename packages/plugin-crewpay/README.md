# @crewpay/plugin-elizaos

ElizaOS 1.x plugin for [CrewPay](https://crewpay.dev) — KOL autohire, escrowed jobs/bounties, and **non-custodial** unsigned launch and payouts.

Package path in this monorepo: `packages/plugin-crewpay`. **Not published to npm yet** (`private: true`).

## Quickstart

```bash
cd packages/plugin-crewpay
npm install
npm run build
npm test
```

### Env

| Variable | Required | Notes |
| --- | --- | --- |
| `CREWPAY_API_KEY` or `CREW_AGENT_API_KEY` | yes (writes) | Claim: `POST /api/agent/keys/claim` → store once |
| `CREWPAY_API_URL` or `CREW_API_URL` | no | Default `https://api.crewpay.dev` |

Never log or print API keys. The plugin and provider only report **env var names** (`CREWPAY_API_KEY`, `CREW_AGENT_API_KEY`).

### Wire into an ElizaOS agent

```ts
import crewpayPlugin from '@crewpay/plugin-elizaos'

export const character = {
  name: 'My Agent',
  plugins: [crewpayPlugin],
  // or load the object from node_modules after publish
}
```

See [`examples/character.crewpay.json`](./examples/character.crewpay.json).

### Actions

| Action | CrewPay API |
| --- | --- |
| `HIRE_CREW` | `POST /api/agent/autohire` |
| `POST_BOUNTY` | `POST /api/jobs/campaigns` (+ optional `/fund`) |
| `POST_TASK` | `POST /api/jobs/coin` (templates; test/devnet) |
| `PAY_AGENT` | `POST /api/jobs/:id/payout` (unsigned when non-custodial) |
| `CHECK_STATUS` | `GET /api/agent/status/:mint` or open jobs list |
| `LAUNCH_COIN` | `POST /api/agent/launch/unsigned` only — **never auto-signs** |

Pass parameters as JSON in the message `content.text` for each action.

Escrow backend is `jobs` by default (`CREWPAY_ESCROW_MODE=jobs`). When unified escrow-for-any-task ships, swap the backend without changing action names.

### Provider

`CREWPAY_STATUS` — API URL, whether a key is configured (not the value), and a discovery/platforms snapshot.

### MCP alternative

For full MCP tool parity (including custodial launch with a local burner), use pinned MCP:

```bash
npx -y crewpay-mcp@1.2.11
```

Hosted (no launcher secret): `https://mcp.crewpay.dev/mcp`

## Safety

- Dry-run launches before spending SOL; human approval via `approvalUrl` when required.
- Fee map: **60% KOL crew / 15% agent / 25% CrewPay** (60/15/5/20 with referrer). Buyback cron **not live**.
- Jobs + escrow: **test/devnet only** — no earnings promises.

## Links

- Agents: https://crewpay.dev/agents  
- OpenAPI: https://api.crewpay.dev/openapi.json  
- Legacy package name: `elizaos-plugin-crewpay` (older action names)
