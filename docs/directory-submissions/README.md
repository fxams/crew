# Agent / MCP directory submissions

**Primary discovery path (preferred):** Official MCP Registry + Smithery + ClawHub.  
Also refresh Glama / mcp.so / awesome-mcp with honest 60/15/25 + dryRunId approval copy.

| Channel | Status | Doc |
|---------|--------|-----|
| Official MCP Registry | Live — `server.json` / remote `crewpay-mcp@1.2.2` | [../mcp-registry-publish.md](../mcp-registry-publish.md) |
| Smithery | Live — refresh description + pin `1.2.2` | [smithery.md](./smithery.md) |
| ClawHub skill | Publish `@fxams/crewpay` **1.1.2** | repo `skills/crewpay/` |
| mcp.so | Draft updated for `1.2.2` | [mcp-so.md](./mcp-so.md) |
| Musebook | SIWS register via ops wallet (`slug=crewpay`) | [musebook.md](./musebook.md) |
| ClawPump | **Live agent** — marketplace listing optional | [clawpump.md](./clawpump.md) |
| Glama | Resubmit with honest copy | [glama.md](./glama.md) |
| awesome-mcp-servers | New PR draft (was #16008) | [../awesome-mcp-pr.md](../awesome-mcp-pr.md) |

## Framework plugin upstream

Published npm adapters + proposal issues (not in-tree PRs yet — fork/push to foreign orgs not available from this agent):

| Framework | npm | Upstream issue |
|-----------|-----|----------------|
| ElizaOS | `elizaos-plugin-crewpay@0.1.1` | [elizaOS/eliza#35120](https://github.com/elizaOS/eliza/issues/35120) |
| Solana Agent Kit | `crewpay-solana-agent-kit-plugin@0.1.1` | [sendaifun/solana-agent-kit#625](https://github.com/sendaifun/solana-agent-kit/issues/625) |
| GOAT SDK | `crewpay-goat-plugin@0.1.1` | [goat-sdk/goat#602](https://github.com/goat-sdk/goat/issues/602) (repo marked historical) |

Sources live under `packages/*-plugin-crewpay` in this monorepo.
