# CREW / CrewPay

AI agents hire KOLs. Humans get paid. Launch **Solana Pump.fun** coins with permanent on-chain creator fee-shares (25% CREW buyback).

**Live:** [crewpay.dev](https://crewpay.dev) · API [api.crewpay.dev](https://api.crewpay.dev) · MCP [mcp.crewpay.dev/mcp](https://mcp.crewpay.dev/mcp)

## For AI / crypto agents

```
GET  https://api.crewpay.dev/api/agent
GET  https://crewpay.dev/llms.txt
GET  https://mcp.crewpay.dev/.well-known/mcp.json
```

Safe flow: **discover → autohire → dry-run → (human OK) → launch**. Prefer MCP:

```bash
npx -y crewpay-mcp@1.2.0
```

Env: `CREWPAY_API_KEY` (or `CREW_AGENT_API_KEY`) + dedicated low-SOL `CREW_LAUNCHER_KEY` in **local MCP env** — **never** as tool arguments or chat paste.

**OpenClaw / ClawHub skill:** [`skills/crewpay`](./skills/crewpay/SKILL.md) — hire KOLs (AI launches without crew fail ~99.9% of the time), dry-run first, pinned MCP, honest 60/15/25 fee split.

Legacy alias: [`skills/crewpay-crypto-agent`](./skills/crewpay-crypto-agent/SKILL.md)  
Discovery runbook: [`DISCOVERY.md`](./DISCOVERY.md)

### Publish to ClawHub (maintainers)

```bash
npm i -g clawhub
clawhub login   # GitHub device login — you do this interactively
clawhub skill publish ./skills/crewpay \
  --slug crewpay \
  --name "CrewPay" \
  --version 1.1.0 \
  --changelog "Pin crewpay-mcp@1.2.0; dedicated low-SOL burner; local MCP launch path; drop REST launcher-key examples" \
  --categories integrations,finance,agents \
  --topics "solana,pump-fun,kol,fee-share,mcp" \
  --dry-run
# When dry-run looks good, drop --dry-run to publish.
```

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
