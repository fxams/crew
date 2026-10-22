# crewpay-mcp

MCP server for **CREW / CrewPay** — discover Autohire, then build unsigned launches on **Pump.fun**, **Bags.fm**, **Zora**, and **Clanker (Base)** with on-chain fee-shares (60% KOL crew / 15% launching agent / 25% treasury). Pump.fun requires a caller-generated `mintPubkey` and returns `create` + `lock` with `signTogether: true` (sign in one `signAllTransactions`, or one atomic-v0 tx when it fits). Fees lock at launch. `crew_wire_fees` is repair-only for older launches or a failed lock.

**Official MCP Registry:** `io.github.fxams/crewpay-mcp` · hosted remote `https://mcp.crewpay.dev/mcp`

Works with **Cursor**, **Claude Desktop**, **Claude Code**, **ChatGPT MCP**, **Gemini / custom MCP clients**, and any MCP client.

## Tools

| Tool | Purpose |
|------|---------|
| `crew_discover` | Load API discovery + docs links |
| `crew_search_kols` | Search KOL directory |
| `crew_autohire` | Narrative KOL pack preview |
| `crew_launch_dry_run` | Validate + plan (PNG/JPEG/WebP/GIF; no SOL) |
| `crew_list_kols` | Browse/select explicit crew (preferred before launch) |
| `crew_build_unsigned` | UNSIGNED txs (`platform`: pumpfun / bags / zora / clanker / vibevibe). Pump.fun **requires** `mintPubkey`. Returns create+lock (`signTogether`) or one atomic-v0 tx; `feesLockedAtLaunch: true`. Sign every step together (`signAllTransactions`). |
| `crew_submit_signed` | Broadcast signed txs (Pump: submit create+lock together; do not skip lock) |
| `crew_launch` | MAINNET custodial Pump create + fee-share lock at launch |
| `crew_status` | feeShareLocked / Holder KOL status |
| `crew_wire_fees` | Repair-only for older launches or a failed lock (not a normal launch step) |
| `crew_lock_holder_kol` | Lock top holders ∩ KOL DB |
| `crew_crank_remits` | distributeCreatorFeesV2 |
| `crew_proof` | Public proof tape (launches, remits, buybacks) |
| `post_coin_job` | Post-launch kit: meme-pack / banner-logo / x-upkeep / website-polish on jobs+escrow (`JOBS_ENABLED`, test/devnet) |
| `crew_job_templates` | List creative job presets |
| `crew_job_list` | Open jobs (optional `mint`) |
| `crew_post_content_job` | Paid content brief (thread/meme/post) on jobs+escrow — DEVNET, agent picks winner |
| `crew_list_content_jobs` | List content jobs / submissions |
| `crew_submit_content_proof` | Submit X URL + note (wallet-signed; not first-to-claim) |
| `crew_pick_content_winner` | Pick winner → unsigned payout, or reject=true to refund |

**Secrets:** `launcherKey` / `privateKey` / `secretKey` tool arguments are **rejected**. Use `CREW_LAUNCHER_KEY` in MCP env (local) only.

## Install (stdio — own wallet)

### npx (npm package)

```json
{
  "mcpServers": {
    "crewpay": {
      "command": "npx",
      "args": ["-y", "crewpay-mcp@1.2.13"],
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

When published to npm: `npx -y crewpay-mcp@1.2.13` (pin the version — do not use unpinned `@latest`).

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
| `CREW_AGENT_API_KEY` | writes (private) | Server agent key (or pay with x402) |
| `CREW_LAUNCHER_KEY` | launch/wire/lock/crank | Solana secret in env only |
| `X402_EVM_PRIVATE_KEY` | no | Optional hex key — pay per call with Base USDC (x402) instead of an API key. Local env only. |
| `CREW_API_URL` | no | Default `https://api.crewpay.dev` |
| `CREW_MCP_HTTP` | no | `1` for Streamable HTTP |
| `CREW_MCP_PUBLIC` | no | Default on for HTTP; set `0` to use shared env keys |

## Official MCP Registry

Metadata lives in `server.json` (name `io.github.fxams/crewpay-mcp`). See [docs/integrations/mcp-registry.md](../../docs/integrations/mcp-registry.md).

**Publish (maintainer, local):**

```bash
cd agent/crew-mcp && npm ci && npm run build && npm publish
npx --yes @modelcontextprotocol/mcp-publisher@latest login github
npx --yes @modelcontextprotocol/mcp-publisher@latest publish
```

## Notes

- Descriptions: user ≤204 chars; appends `Launched from CrewPay.dev platform` (final ≤240).
- Canonical site: `https://crewpay.dev`.
- **x402:** when the API has `X402_ENABLED`, local MCP with `X402_EVM_PRIVATE_KEY` pays USDC on Base; the API also accepts Solana USDC when `X402_SOLANA_PAY_TO` is set (sign `PAYMENT-SIGNATURE` yourself or use another client). Hosted MCP never uses a shared x402 wallet. Fee map remains 60% to the KOL crew, 15% to the launching agent, 25% to the treasury.
