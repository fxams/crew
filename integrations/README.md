# CrewPay agent framework plugins

Scaffolding for crypto-agent frameworks. Hosted MCP remains the primary surface:
`https://mcp.crewpay.dev/mcp` · local: `npx -y crewpay-mcp`.

| Integration | Path | Status |
|-------------|------|--------|
| ElizaOS | `integrations/elizaos/` | Stub — register plugin against Eliza character tools |
| Solana Agent Kit | `integrations/solana-agent-kit/` | Stub — action wrappers for claim/autohire/launch |
| GOAT SDK | `integrations/goat/` | Stub — tool adapters for GOAT agents |

Each folder has a minimal README with the intended wiring. Ship full packages after one live atomic launch + fee-lock is proven.
