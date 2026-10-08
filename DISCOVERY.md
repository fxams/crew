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
| WellKnown `crewpay` | **Live** | https://wellknown.network/agents/crewpay — **claim** ownership |
| WellKnown `crew-agent-launch` | **Live** | https://wellknown.network/agents/crew-agent-launch — **claim** |
| directory.llmstxt.cloud | **Waitlist** | Submitted free tier (Finance) — review 1–3 months |
| PulseMCP | **Paused** | Site paused; will auto-ingest Official MCP Registry + GitHub `mcp-server` topic |
| Smithery | **Needs login** | Operator: https://smithery.ai/new → `https://mcp.crewpay.dev/mcp` |
| Glama | **Needs login** | `glama.json` in repo; claim after GitHub index |
| mcp.so | **Paid $39** | Optional; free path = Official Registry |
| Official MCP Registry | **Blocked on npm** | Needs `NPM_TOKEN` + `mcp-publisher login github` → `agent/crew-mcp/server.json` |
| GitHub topics | **Needs operator** | Cloud token 403 on `gh repo edit` — see commands below |
| Solana / Metaplex Agent Registry | **Needs wallet** | See `docs/register-solana-agent.md` |
| CT / X | **Draft ready** | `docs/ct-announce.md` (no post write API in this agent) |

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
