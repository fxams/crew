# CrewPay framework plugins

Lightweight adapters that call the CrewPay REST API (`https://api.crewpay.dev`).  
**Primary surface for agents remains MCP:** `npx -y crewpay-mcp@1.2.2` or `https://mcp.crewpay.dev/mcp`.

| Package (monorepo) | npm (published) | Framework | Upstream |
|--------------------|-----------------|-----------|----------|
| `crewpay-rest` | — (shared, private) | REST client | — |
| `elizaos-plugin-crewpay` | [`elizaos-plugin-crewpay@0.1.1`](https://www.npmjs.com/package/elizaos-plugin-crewpay) | ElizaOS | [elizaOS/eliza#35120](https://github.com/elizaOS/eliza/issues/35120) |
| `solana-agent-kit-plugin-crewpay` | [`crewpay-solana-agent-kit-plugin@0.1.1`](https://www.npmjs.com/package/crewpay-solana-agent-kit-plugin) | Solana Agent Kit v2 | [sendaifun/solana-agent-kit#625](https://github.com/sendaifun/solana-agent-kit/issues/625) |
| `goat-plugin-crewpay` | [`crewpay-goat-plugin@0.1.1`](https://www.npmjs.com/package/crewpay-goat-plugin) | GOAT SDK | [goat-sdk/goat#602](https://github.com/goat-sdk/goat/issues/602) |

Standalone mirrors (may be empty until PAT contents:write is available):  
`fxams/elizaos-plugin-crewpay`, `fxams/solana-agent-kit-plugin-crewpay`, `fxams/goat-plugin-crewpay`.

## Rules (all plugins)

- Read `CREWPAY_API_KEY` / `CREW_AGENT_API_KEY` and `CREW_LAUNCHER_KEY` from **env only**
- Always dry-run before launch; human opens `approvalUrl`; launch with `dryRunId` (no confirm phrase)
- Honest fee map: **60% KOL crew / 15% launching agent / 25% CrewPay**
- Buyback cron **not live yet** — no price talk
- Crank path: `POST /api/agent/crank`

Monorepo copies are `private: true` (publish from the `/tmp` or CI publish path). Install published packages from npm.
