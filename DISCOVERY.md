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
| Local MCP | `npx -y crewpay-mcp@1.2.0` |
| Hosted MCP | https://mcp.crewpay.dev/mcp |
| ClawHub skill | `openclaw skills install @fxams/crewpay` · https://clawhub.ai/fxams/crewpay |
| Skill (repo) | `skills/crewpay/SKILL.md` |
| Sitemap | https://crewpay.dev/sitemap.xml |
| Claim page | https://crewpay.dev/claim/:handle |
| GTM register checklist | `docs/gtm-register-worth-it.md` |

## Submission status (2026-10-08)

| Channel | Status | Notes |
|---------|--------|-------|
| WellKnown `crewpay` | **Verified owner** | https://wellknown.network/agents/crewpay |
| WellKnown `crew-agent-launch` | **Verified owner** | https://wellknown.network/agents/crew-agent-launch |
| directory.llmstxt.cloud | **Waitlist** | Submitted free tier (Finance) — review 1–3 months |
| PulseMCP | **Paused** | Prerequisites done (Official Registry + `mcp-server` topic); auto-ingest when they reopen |
| Smithery | **Live** | https://smithery.ai/servers/fxams/crewpay — `https://mcp.crewpay.dev/mcp` |
| Glama | **Skipped** | Optional later — see `docs/directory-submissions/glama.md` |
| mcp.so | **Draft ready** | `docs/directory-submissions/mcp-so.md` (paid path optional) |
| Official MCP Registry | **Primary — publish 1.2.0 + remote** | `docs/mcp-registry-publish.md` (registry still shows 1.1.2 until you publish) |
| GitHub topics | **Done** | description + homepage + `mcp-server` and related topics set |
| awesome-mcp-servers | **Skipped** | #16008 closed — needed Glama score; use Registry + Smithery + ClawHub |
| ClawHub skill | **Published** | `openclaw skills install @fxams/crewpay` · https://clawhub.ai/fxams/crewpay |
| Solana / Metaplex Agent Registry | **Needs funded wallet** | `docs/register-solana-agent.md` |
| CT / X | **Posted** | https://x.com/crewpayhq/status/2108262057569341930 |
| Proof tape (mainnet) | **Live** | $STRAW2GOLD · $CATMEETING · **$CADDY** `FhxrtQoDApgN4hpjr9muMfjgQuGknJ2DPswa4CzMZA9H` · https://crewpay.dev/proof |
| Self-serve agent keys | **Shipped** | `POST /api/agent/keys/claim` + MCP `crew_claim_key` → `crew_ak_…` (5/hour/IP) |
| Atomic launch + fee-lock | **Code on main; API deploy lagging** | Prefers **Jito bundle** then v0+ALT; sequential is racy (~2s on $CADDY — no leak that time). **Manual Deploy crewpay-api** until `/api/agent/launches` is live |
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

### Official MCP Registry (primary)

See `docs/mcp-registry-publish.md`. **Do not** `npx mcp-publisher` (wrong npm package). Install the GitHub release binary, then:

```bash
cd agent/crew-mcp
mcp-publisher login github          # device code → github.com/login/device
mcp-publisher publish ./server.json
curl -sS 'https://registry.modelcontextprotocol.io/v0/servers?search=crewpay' \
  | jq '.servers[0].server | {name, version, remotes}'
```

### Framework plugins

Scaffolds in `packages/` (ElizaOS, Solana Agent Kit, GOAT). Upstream PRs optional — see `packages/README.md`.

### Directory drafts

- Glama: `docs/directory-submissions/glama.md`
- Smithery: `docs/directory-submissions/smithery.md`
- mcp.so: `docs/directory-submissions/mcp-so.md`
- Musebook: `docs/directory-submissions/musebook.md`
- ClawPump: `docs/directory-submissions/clawpump.md`

### Re-announce WellKnown

```bash
node scripts/discover-submit.mjs
```

### Solana registry

See `docs/register-solana-agent.md`.

## Proof of life

Empty `/proof` tape is the #1 trust blocker for serious agents. One real mainnet launch + buyback run matters more than another directory listing.
