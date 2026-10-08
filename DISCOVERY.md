# Agent discovery — status & runbook

How crypto / Solana agents find **CREW / CrewPay**.

## Canonical surfaces (shipped)

| Surface | URL |
|---------|-----|
| Site | https://crewpay.dev |
| Agents UI | https://crewpay.dev/agents |
| llms.txt | https://crewpay.dev/llms.txt |
| llms-full | https://crewpay.dev/llms-full.txt · https://api.crewpay.dev/llms-full.txt |
| AGENTS.md | https://crewpay.dev/AGENTS.md |
| OpenAPI | https://api.crewpay.dev/openapi.json |
| Agent card (API) | https://api.crewpay.dev/.well-known/agent.json |
| Agent card (site) | https://crewpay.dev/.well-known/agent.json |
| MCP HTTP | https://mcp.crewpay.dev/mcp |
| MCP well-known | https://mcp.crewpay.dev/.well-known/mcp.json |
| MCP server-card | https://mcp.crewpay.dev/.well-known/mcp/server-card.json |
| Discovery JSON | https://api.crewpay.dev/api/agent |
| Proof | https://crewpay.dev/proof |
| Local MCP | `npx -y github:fxams/crew#path:agent/crew-mcp` |
| Skill | `skills/crewpay-crypto-agent/SKILL.md` |

## Submission status (2026-10-08)

| Channel | Status | Notes |
|---------|--------|-------|
| WellKnown `crewpay` | **Verified owner** | https://wellknown.network/agents/crewpay |
| WellKnown `crew-agent-launch` | **Verified owner** | https://wellknown.network/agents/crew-agent-launch |
| directory.llmstxt.cloud | **Waitlist** | Submitted free tier (Finance) — review 1–3 months |
| PulseMCP | **Paused** | Prerequisites done (Official Registry + `mcp-server` topic); auto-ingest when they reopen |
| Smithery | **Live** | https://smithery.ai/servers/fxams/crewpay — `https://mcp.crewpay.dev/mcp` |
| Glama | **Needs operator GitHub OAuth** | `glama.json` on main; Add MCP Server at https://glama.ai (no API key in Cursor secrets) |
| mcp.so | **Skipped (paid)** | Optional $39; free path = Official Registry (done) |
| Official MCP Registry | **npm 1.2.0 live; registry JWT expired** | npm `crewpay-mcp@1.2.0` (`latest`). Re-run `mcp-publisher login github && mcp-publisher publish ./server.json` for registry card @1.2.0 |
| GitHub topics | **Done** | description + homepage + `mcp-server` and related topics set |
| awesome-mcp-servers | **PR open** | https://github.com/punkpeye/awesome-mcp-servers/pull/16008 (+1 Finance & Fintech) |
| Solana / Metaplex Agent Registry | **Needs funded wallet** | `docs/register-solana-agent.md` |
| CT / X | **Posted** | https://x.com/crewpayhq/status/2108262057569341930 |
| Proof tape (mainnet) | **Live** | First agent launch $STRAW2GOLD · mint `GKeoMKEsSZPch2WF8cRk7FLkYwj2kEj2rVWEi92tDkAp` · https://crewpay.dev/proof |
| Self-serve agent keys | **Shipped** | `POST /api/agent/keys/claim` + MCP `crew_claim_key` → `crew_ak_…` (5/hour/IP) |
| Atomic launch + fee-lock | **Shipped** | Prefer v0+ALT single-tx → Jito bundle → sequential (racy); `lockPath`/`createSlot`/`lockSlot`; `CREW_ATOMIC_REQUIRED=1` to abort |
| Crank sweep+distribute | **Shipped** | Fixes CreatorFeesNotSwept 6095; ops payer via `CREW_OPS_KEY` (launcher optional) |
| Per-key launch history | **Shipped** | `GET /api/agent/launches` + MCP `crew_list_launches` |
| npm `crewpay-mcp` | **1.2.0** | Includes `crew_claim_key` + `crew_list_launches` |

## Operator commands (do once)

### GitHub topics (PulseMCP crawl)

```bash
gh repo edit fxams/crew \
  --description 'CREW / CrewPay — AI agents launch Solana Pump.fun coins with on-chain KOL fee-shares and 25% CREW buyback' \
  --homepage 'https://crewpay.dev' \
  --add-topic mcp-server --add-topic mcp --add-topic solana --add-topic pump-fun \
  --add-topic crypto --add-topic ai-agent --add-topic meme-coin --add-topic kol \
  --add-topic crewpay --add-topic fee-share --add-topic model-context-protocol
```

### Smithery

```bash
npx @smithery/cli auth login
npx @smithery/cli mcp publish "https://mcp.crewpay.dev/mcp" -n fxams/crewpay \
  --config-schema '{"type":"object","properties":{"apiKey":{"type":"string","description":"CREW agent API key (x-crew-api-key)"}},"required":["apiKey"]}'
```

### npm + Official MCP Registry

```bash
# Set NPM_TOKEN on GitHub Actions, or locally:
cd agent/crew-mcp && npm publish --access public
# Then:
npx -y mcp-publisher login github
npx -y mcp-publisher publish ./server.json
```

### Re-announce WellKnown

```bash
node scripts/discover-submit.mjs
```

### Solana registry

See `docs/register-solana-agent.md`.

## Proof of life

Empty `/proof` tape is the #1 trust blocker for serious agents. One real mainnet launch + buyback run matters more than another directory listing.
