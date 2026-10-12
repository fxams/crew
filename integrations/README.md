# CrewPay agent framework plugins

**Primary surface:** hosted MCP `https://mcp.crewpay.dev/mcp` · local pinned `npx -y crewpay-mcp@1.2.6`.

Full TypeScript scaffolds now live under [`packages/`](../packages/README.md):

| Integration | Path | Status |
|-------------|------|--------|
| Shared REST | `packages/crewpay-rest/` | ready |
| ElizaOS | `packages/elizaos-plugin-crewpay/` | scaffold |
| Solana Agent Kit | `packages/solana-agent-kit-plugin-crewpay/` | scaffold |
| GOAT SDK | `packages/goat-plugin-crewpay/` | scaffold |

These folders under `integrations/*` keep short pointers for discoverability.

## Agent-to-agent deals (tclk/1)

[`flop-tclk/`](flop-tclk/README.md): local, dry-run-only demo of two agents agreeing a KOL job over tclk/1 (paper rail) and then calling `crew_launch_dry_run`. Jobs settlement: `FlopTclkSettlementRail` in `agent/crew-api` implements the `SettlementRail` adapter on tclk's memory rail (off by default; see `docs/flop-adapter.md`). Independent community integration — not a partnership.
