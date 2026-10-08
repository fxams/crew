# crewpay-mcp

MCP server for **CREW / CrewPay** — so crypto AI agents can discover Autohire, dry-run, launch Pump.fun coins with on-chain fee-shares, repair fee locks, crank remits, and read the proof tape.

Works with **Cursor**, **Claude Desktop**, **Claude Code**, **ChatGPT MCP**, **Gemini / custom MCP clients**, and any tool-using agent that speaks MCP.

## Tools

| Tool | Purpose |
|------|---------|
| `crew_discover` | Load API discovery + docs links |
| `crew_search_kols` | Search KOL directory |
| `crew_autohire` | Narrative KOL pack preview |
| `crew_launch_dry_run` | Validate + plan launch (no SOL / no mint) |
| `crew_launch` | MAINNET Pump create + CREW fee-shares |
| `crew_status` | feeShareLocked / Holder KOL status |
| `crew_wire_fees` | Repair / lock fee-shares on an existing mint |
| `crew_lock_holder_kol` | Lock top holders ∩ KOL DB (one-shot) |
| `crew_crank_remits` | distributeCreatorFeesV2 |
| `crew_proof` | Public buyback + remit proof tape |
| Prompt `crew-crypto-launch` | Launch playbook for crypto agents |

Resources: `crew-discovery`, `crew-llms`.

**Secrets:** set `CREW_AGENT_API_KEY` + `CREW_LAUNCHER_KEY` in MCP **env only** — never as tool arguments.

## Install (stdio — Cursor / Claude Desktop)

```json
{
  "mcpServers": {
    "crewpay": {
      "command": "npx",
      "args": ["-y", "tsx", "agent/crew-mcp/src/index.ts"],
      "cwd": "/path/to/crew",
      "env": {
        "CREW_AGENT_API_KEY": "your-server-agent-key",
        "CREW_LAUNCHER_KEY": "your-solana-secret-base58",
        "CREW_API_URL": "https://api.crewpay.dev"
      }
    }
  }
}
```

After `npm ci && npm run build` in `agent/crew-mcp`:

```json
{
  "mcpServers": {
    "crewpay": {
      "command": "node",
      "args": ["/path/to/crew/agent/crew-mcp/dist/index.js"],
      "env": {
        "CREW_AGENT_API_KEY": "…",
        "CREW_LAUNCHER_KEY": "…"
      }
    }
  }
}
```

## Remote HTTP MCP

```bash
cd agent/crew-mcp
CREW_MCP_HTTP=1 CREW_AGENT_API_KEY=… npm start
# → http://localhost:3333/mcp
```

Production (Render service `crewpay-mcp`): `https://mcp.crewpay.dev/mcp`

Public discovery (no MCP client required):

- https://crewpay.dev/llms.txt
- https://api.crewpay.dev/api/agent
- https://crewpay.dev/agents

## Env

| Variable | Required | Purpose |
|----------|----------|---------|
| `CREW_AGENT_API_KEY` | writes | Server agent key (not browser `VITE_` key) |
| `CREW_LAUNCHER_KEY` | launch/wire/lock/crank | Solana secret in env only |
| `CREW_API_URL` | no | Default `https://api.crewpay.dev` |
| `CREW_MCP_HTTP` | no | `1` for Streamable HTTP |

## Crypto agent keywords

Solana · Pump.fun · meme coin · KOL hire · creator fees · fee-share · CrewPay · autohire · AI agent launch · dry-run · buyback
