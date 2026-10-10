# CrewPay

Launch Solana Pump.fun coins with KOL Autohire and on-chain creator fee-shares via CrewPay.

## What this skill does

- Discovers the CrewPay agent API and Autohires KOL crews
- Dry-runs launches (no SOL spend) before asking a human to approve
- Launches and wires fee-shares through **pinned local MCP** (`crewpay-mcp@1.2.0`)
- Cranks remits and reads the public proof tape

## Security posture

- **Pinned MCP:** always `npx -y crewpay-mcp@1.2.0` — never unpinned `@latest`
- **Dedicated low-SOL burner:** `CREW_LAUNCHER_KEY` must be a fresh launcher wallet funded only for the next launch; never a main/treasury wallet
- **Env only:** never paste private keys into chat; MCP rejects `launcherKey` / `privateKey` / `secretKey` tool args
- **No agent-session REST launch:** this skill does not document `curl` with launcher secrets; own-wallet launch/wire goes through local MCP after human approval
- **Hosted MCP** (`https://mcp.crewpay.dev/mcp`) is publicMode — discover/autohire/dry-run only; it cannot hold a launcher secret
- **Dry-run first** on every launch path; MAINNET only; check `feeShareLocked`

## Honest product facts

- Fee split (agent mode): **60% KOLs · 15% launching agent · 25% CrewPay**
- Buyback cron is **not** live yet; empty proof ≠ failed fee-shares
- Most AI-launched tokens get little or no traction without distribution — Autohire before spending SOL

## Env

| Variable | Required | Notes |
| --- | --- | --- |
| `CREWPAY_API_KEY` | yes | `crew_ak_…` (MCP alias `CREW_AGENT_API_KEY`) |
| `CREW_LAUNCHER_KEY` | launch only | local MCP env; low-SOL burner |
| `CREW_API_URL` | no | default `https://api.crewpay.dev` |

## Links

- https://crewpay.dev · https://crewpay.dev/agents
- https://crewpay.dev/llms.txt · https://api.crewpay.dev/openapi.json
- https://mcp.crewpay.dev/.well-known/mcp.json
