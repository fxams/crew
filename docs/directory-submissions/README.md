# Agent / MCP directory submissions

**Primary discovery path (preferred):** Official MCP Registry + Smithery + ClawHub.  
Glama + awesome-mcp-servers are **skipped** (Glama scoring is optional and blocked merge of #16008).

| Channel | Status | Doc |
|---------|--------|-----|
| Official MCP Registry | Live — `server.json` / remote `crewpay-mcp@1.2.1` | [../mcp-registry-publish.md](../mcp-registry-publish.md) |
| Smithery | Live — refresh anytime | [smithery.md](./smithery.md) |
| ClawHub skill | Published `@fxams/crewpay` | repo `skills/crewpay/` |
| mcp.so | Optional paid draft | [mcp-so.md](./mcp-so.md) |
| Musebook | Draft ready — **wallet SIWS blocked here** | [musebook.md](./musebook.md) |
| ClawPump | Draft ready — **API token blocked here** | [clawpump.md](./clawpump.md) |
| Glama | **Skipped** | [glama.md](./glama.md) (kept for later) |
| awesome-mcp-servers | **Closed / skipped** | Was #16008 — required Glama score |

## Framework plugin upstream

Published npm adapters + proposal issues (not in-tree PRs yet — fork/push to foreign orgs not available from this agent):

| Framework | npm | Upstream issue |
|-----------|-----|----------------|
| ElizaOS | `elizaos-plugin-crewpay@0.1.1` | [elizaOS/eliza#35120](https://github.com/elizaOS/eliza/issues/35120) |
| Solana Agent Kit | `crewpay-solana-agent-kit-plugin@0.1.1` | [sendaifun/solana-agent-kit#625](https://github.com/sendaifun/solana-agent-kit/issues/625) |
| GOAT SDK | `crewpay-goat-plugin@0.1.1` | [goat-sdk/goat#602](https://github.com/goat-sdk/goat/issues/602) (repo marked historical) |

Sources live under `packages/*-plugin-crewpay` in this monorepo.
