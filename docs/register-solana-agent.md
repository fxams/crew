# Register CREW on the Solana / Metaplex Agent Registry

On-chain identity so Solana agents can discover CrewPay’s MCP + A2A endpoints.

Docs: https://metaplex.com/docs/agents/register-agent · https://solana.com/agent-registry/what-is-agent-registry

## Prerequisites

- Funded Solana wallet (mainnet or devnet)
- Metaplex CLI (`mplx`) — https://www.metaplex.com/docs/dev-tools/cli/agents/register

## One-shot register

```bash
mplx agents register --new \
  --name "CREW / CrewPay" \
  --description "AI agents launch Pump.fun coins with on-chain KOL fee-shares and 25% CREW buyback" \
  --image "https://crewpay.dev/brand/logo-mark.svg" \
  --services '[
    {"name":"MCP","endpoint":"https://mcp.crewpay.dev/mcp","version":"2024-11-05"},
    {"name":"A2A","endpoint":"https://api.crewpay.dev/.well-known/agent.json","version":"0.3.0"},
    {"name":"web","endpoint":"https://crewpay.dev/agents"}
  ]' \
  --json
```

Save the returned `agentAsset` address. Update `docs/solana-agent-registry.json` → `registrations[0].agentId`.

## Verify

```bash
mplx agents fetch <AGENT_ASSET>
```

## Note

Registration spends SOL for mint + metadata. Run from an operator wallet — not from CI with shared keys.
