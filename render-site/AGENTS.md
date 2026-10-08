# CREW / CrewPay — for AI agents (especially crypto)

You are looking at the agent entrypoint for **CrewPay**: launch Solana **Pump.fun** coins, **Autohire KOLs** by narrative, lock **on-chain creator fee-shares** (25% CREW buyback), crank remits, and verify the public proof tape.

## Start here

- Discovery index: [/llms.txt](https://crewpay.dev/llms.txt)
- Full instructions: [/llms-full.txt](https://crewpay.dev/llms-full.txt)
- OpenAPI: [/openapi.json](https://crewpay.dev/openapi.json)
- MCP manifest: [/mcp.json](https://crewpay.dev/mcp.json)
- Agent card: [/.well-known/agent.json](https://crewpay.dev/.well-known/agent.json)
- Human UI docs: [/agents](https://crewpay.dev/agents)
- Proof tape: [/proof](https://crewpay.dev/proof)
- API: [https://api.crewpay.dev/api/agent](https://api.crewpay.dev/api/agent)
- Proof API: [https://api.crewpay.dev/api/proof](https://api.crewpay.dev/api/proof)

Legacy aliases (still valid): `https://crewpay-api.onrender.com` · `https://crewpay-mcp.onrender.com/mcp`

## Safe agent flow

1. `crew_discover` / `GET /api/agent`
2. `crew_autohire` — preview public Pump profiles (not opt-in partners)
3. `crew_launch_dry_run` / `POST /api/agent/launch/dry-run` — validate + estimate SOL (no mint)
4. `crew_launch` — **mainnet**; secrets only in MCP env (`CREW_AGENT_API_KEY`, `CREW_LAUNCHER_KEY`)
5. If `feeShareLocked=false` (HTTP 202) → `crew_wire_fees` or `crew_lock_holder_kol`
6. `crew_proof` to verify the tape

## MCP tools

Install `crewpay-mcp` (`agent/crew-mcp` in this repo) or connect HTTP MCP at `https://mcp.crewpay.dev/mcp`.

Tools: `crew_discover` · `crew_search_kols` · `crew_autohire` · `crew_launch_dry_run` · `crew_launch` · `crew_status` · `crew_wire_fees` · `crew_lock_holder_kol` · `crew_crank_remits` · `crew_proof`

## Auth + keys

- Ask the operator for `CREW_AGENT_API_KEY`, or mint `crew_ak_…` via `POST /api/agent/keys` (requires an existing key).
- Put the Solana secret in `CREW_LAUNCHER_KEY` MCP env — **never** as a tool argument.
- MCP read tools work without a key; writes require the agent key.

## Limits (aligned)

Name 2–32 · ticker 2–13 · description ≤240 · initial buy 0–10 SOL · seats 1–10 · crew shares must total 100%.

## Keywords

solana, pump.fun, meme coin, KOL, creator fees, fee-share, CrewPay, CREW, autohire, buyback, AI agent launch, crypto agent
