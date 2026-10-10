# crewpay-mcp

MCP server for **CREW / CrewPay** — discover Autohire, dry-run, launch Pump.fun coins with on-chain fee-shares, repair fee locks, crank remits, and read the proof tape.

Works with **Cursor**, **Claude Desktop**, **Claude Code**, **ChatGPT MCP**, **Gemini / custom MCP clients**, and any MCP client.

## Tools

| Tool | Purpose |
|------|---------|
| `crew_discover` | Load API discovery + docs links |
| `crew_search_kols` | Search KOL directory |
| `crew_autohire` | Narrative KOL pack preview |
| `crew_launch_dry_run` | Validate + plan (PNG/JPEG/WebP/GIF; no SOL) |
| `crew_launch` | MAINNET Pump create + CREW fee-shares |
| `crew_status` | feeShareLocked / Holder KOL status |
| `crew_wire_fees` | Repair / lock fee-shares |
| `crew_lock_holder_kol` | Lock top holders ∩ KOL DB |
| `crew_crank_remits` | distributeCreatorFeesV2 |
| `crew_proof` | Public buyback + remit proof tape |

**Secrets:** `launcherKey` / `privateKey` / `secretKey` tool arguments are **rejected**. Use `CREW_LAUNCHER_KEY` in MCP env (local) only.

## Install (stdio — own wallet)

### npx (npm package)

```json
{
  "mcpServers": {
    "crewpay": {
      "command": "npx",
      "args": ["-y", "crewpay-mcp"],
      "env": {
        "CREW_AGENT_API_KEY": "…",
        "CREW_LAUNCHER_KEY": "your-solana-secret-base58",
        "CREW_API_URL": "https://api.crewpay.dev"
      }
    }
  }
}
```

### From a git checkout

```bash
cd agent/crew-mcp && npm ci && npm run build
```

```json
{
  "mcpServers": {
    "crewpay": {
      "command": "node",
      "args": ["/path/to/crew/agent/crew-mcp/dist/index.js"],
      "env": {
        "CREW_AGENT_API_KEY": "…",
        "CREW_LAUNCHER_KEY": "your-solana-secret-base58",
        "CREW_API_URL": "https://api.crewpay.dev"
      }
    }
  }
}
```

When published to npm: `npx -y crewpay-mcp@latest` with the same env.

## Remote HTTP MCP

```bash
cd agent/crew-mcp
CREW_MCP_HTTP=1 npm start
# → http://localhost:3333/mcp
# discovery → http://localhost:3333/.well-known/mcp.json
# HTTP defaults to publicMode (require x-crew-api-key). Opt out: CREW_MCP_PUBLIC=0
```

Production: `https://mcp.crewpay.dev/mcp` · `https://mcp.crewpay.dev/.well-known/mcp.json`  
Public mode: pass `x-crew-api-key` for writes. **Cannot launch with your wallet** on the shared host — use local stdio or REST.

## Env

| Variable | Required | Purpose |
|----------|----------|---------|
| `CREW_AGENT_API_KEY` | writes (private) | Server agent key |
| `CREW_LAUNCHER_KEY` | launch/wire/lock/crank | Solana secret in env only |
| `CREW_API_URL` | no | Default `https://api.crewpay.dev` |
| `CREW_MCP_HTTP` | no | `1` for Streamable HTTP |
| `CREW_MCP_PUBLIC` | no | Default on for HTTP; set `0` to use shared env keys |

## Notes

- Descriptions: user ≤204 chars; appends `Launched from CrewPay.dev platform` (final ≤240).
- Canonical site: `https://crewpay.dev`.
