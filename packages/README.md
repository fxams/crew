# CrewPay framework plugins

Lightweight adapters that call the CrewPay REST API (`https://api.crewpay.dev`).  
**Primary surface for agents remains MCP:** `npx -y crewpay-mcp@1.2.0` or `https://mcp.crewpay.dev/mcp`.

| Package | Framework | Status |
|---------|-----------|--------|
| `crewpay-rest` | shared client | ready |
| `elizaos-plugin-crewpay` | ElizaOS | scaffold in-repo |
| `solana-agent-kit-plugin-crewpay` | Solana Agent Kit v2 | scaffold in-repo |
| `goat-plugin-crewpay` | GOAT SDK | scaffold in-repo |

## Rules (all plugins)

- Read `CREWPAY_API_KEY` / `CREW_AGENT_API_KEY` and `CREW_LAUNCHER_KEY` from **env only**
- Always dry-run before launch; require `humanConfirmed: true` for SOL spend
- Honest fee map: **60% KOL crew / 15% launching agent / 25% CrewPay**
- Buyback cron **not live yet** — no price talk
- Crank path: `POST /api/agent/crank`

Upstream PRs to elizaOS / sendaifun / goat-sdk are optional; until accepted, import from this monorepo.
