# CREW / CrewPay

AI agents hire KOLs. Humans get paid. Launch **Solana Pump.fun** coins with permanent on-chain creator fee-shares (60/15/25 default; 60/15/5/20 when the agent claimed a key with a KOL referral code; buyback cron not live yet).

**Live:** [crewpay.dev](https://crewpay.dev) · API [api.crewpay.dev](https://api.crewpay.dev) · MCP [mcp.crewpay.dev/mcp](https://mcp.crewpay.dev/mcp)

## For AI / crypto agents

```
GET  https://api.crewpay.dev/api/agent
GET  https://crewpay.dev/llms.txt
GET  https://mcp.crewpay.dev/.well-known/mcp.json
```

Safe flow: **discover → autohire → dry-run → (human OK) → launch**. Prefer MCP:

```bash
npx -y crewpay-mcp@1.2.6
```

Env: `CREWPAY_API_KEY` (or `CREW_AGENT_API_KEY`) + dedicated low-SOL `CREW_LAUNCHER_KEY` in **local MCP env** — **never** as tool arguments or chat paste. Hosted: https://mcp.crewpay.dev/mcp

**OpenClaw / ClawHub skill:** [`skills/crewpay`](./skills/crewpay/SKILL.md) — `openclaw skills install @fxams/crewpay` — hire KOLs, dry-run first, open approvalUrl, then launch with `dryRunId`. Honest fee split 60/15/25 or 60/15/5/20 with referral (buyback not live yet).

Legacy alias: [`skills/crewpay-crypto-agent`](./skills/crewpay-crypto-agent/SKILL.md)  
Discovery runbook: [`DISCOVERY.md`](./DISCOVERY.md) · Framework plugins: [`packages/`](./packages/README.md)

### Publish to ClawHub (maintainers)

```bash
npm i -g clawhub
clawhub login   # GitHub device login — you do this interactively
clawhub skill publish ./skills/crewpay \
  --slug crewpay \
  --name "CrewPay" \
  --version 1.1.1 \
  --changelog "Fix crank path; pin MCP; honest fee map" \
  --categories integrations,finance,agents \
  --topics "solana,pump-fun,kol,fee-share,mcp" \
  --dry-run
# When dry-run looks good, drop --dry-run to publish.
```

### Official MCP Registry

See [`docs/mcp-registry-publish.md`](./docs/mcp-registry-publish.md).

## Desk (humans)

```bash
cd agent/crew
npm install
npm run dev
```

See [`agent/crew/DEPLOY.md`](./agent/crew/DEPLOY.md) · [`agent/crew/PRODUCT.md`](./agent/crew/PRODUCT.md).

## Packages

| Path | Role |
|------|------|
| `agent/crew` | Vite desk UI |
| `agent/crew-api` | Agent API + proof + buyback cron |
| `agent/crew-mcp` | MCP server (`crewpay-mcp`) |
| `services/acp-provider` | Virtuals ACP v2 provider worker (no-op unless `ACP_ENABLED=1`) |

## Virtuals ACP (agents hire CrewPay)

`GET https://api.crewpay.dev/api/platforms` reports `acp.enabled` (false unless `ACP_ENABLED=1`). Separate worker: [`services/acp-provider`](./services/acp-provider/README.md). Complete no-op until that flag is on. Paying agent wallet = identity. Fee map unchanged (60% hired KOL crew / 15% launching agent / rest treasury). Launch jobs stay non-custodial (unsigned txs + `crew_submit_signed`).

This repo does **not** register an ACP agent, generate keys, or move funds.

### Offerings

```json
[
  {
    "name": "crewpay_autohire_kol_crew",
    "description": "Hire a KOL crew for an existing token via CrewPay Autohire. Deliverable is crew list JSON.",
    "priceUsd": 0.02,
    "requirements": { "required": ["mint", "platform", "budget"] }
  },
  {
    "name": "crewpay_launch_with_crew",
    "description": "Unsigned launch txs (crew_build_unsigned) plus crew_submit_signed instructions. Non-custodial.",
    "priceUsd": 0.10,
    "requirements": { "required": ["name", "ticker"] }
  }
]
```

### Operator setup

1. Register a provider on [app.virtuals.io/acp/new](https://app.virtuals.io/acp/new).
2. **Signers → + Add Signer.** Put the key in `ACP_SIGNER_KEY` only (never logs, never commit).
3. Add the two offerings (full JSON in [`services/acp-provider/README.md`](./services/acp-provider/README.md)).
4. `ACP_ENABLED=1` `ACP_CHAIN_ID=84532` then `npm start --prefix services/acp-provider`.

