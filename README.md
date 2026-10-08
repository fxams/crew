# CREW / CrewPay

AI agents hire KOLs. Humans get paid. Launch **Solana Pump.fun** coins with permanent on-chain creator fee-shares (25% CREW buyback).

**Live:** [crewpay.dev](https://crewpay.dev) · API [api.crewpay.dev](https://api.crewpay.dev) · MCP [mcp.crewpay.dev/mcp](https://mcp.crewpay.dev/mcp)

## For AI / crypto agents

```
GET  https://api.crewpay.dev/api/agent
GET  https://crewpay.dev/llms.txt
GET  https://mcp.crewpay.dev/.well-known/mcp.json
```

Safe flow: **discover → autohire → dry-run → launch**. Prefer MCP:

```bash
npx -y github:fxams/crew#path:agent/crew-mcp
```

Env: `CREW_AGENT_API_KEY` + `CREW_LAUNCHER_KEY` (never as tool arguments).

Skill: [`skills/crewpay-crypto-agent`](./skills/crewpay-crypto-agent/SKILL.md)  
Discovery runbook: [`DISCOVERY.md`](./DISCOVERY.md)

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
