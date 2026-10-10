# GTM checklist — register worth it + agent discovery

Operator-facing status after `cursor/kol-register-worth-it-b69e`.

## Shipped in this change

| Item | Status |
|------|--------|
| Registered Autohire priority | **Code** — API + desk boost + registered wallet |
| Verified badge in directory | **Code** — `/kols` + register board |
| Replace scraped wallet + dual earnings | **Code** — `prior_wallets` + desk performance union |
| Claim page from past payouts | **Code** — `/claim/:handle` + `GET /api/kols/claim/:username` |
| Leaderboard by SOL earned | **Code** — register board ranked by remits |
| Shareable card on KOL desk | **Code** — copy + X intent |
| Payout → mention draft (approval) | **Code** — `kol_mention_drafts`; never auto-posts |
| MCP 1.2.0 + hosted URL | **Already live** — republish Official Registry JWT |
| `npx -y crewpay-mcp` in llms | **Code** — sync discovery mirrors |
| `sitemap.xml` | **Code** |
| Honest buyback copy | **Code** — fee-share locked; market buy when env set |
| Framework plugin stubs | **Docs stubs** — Eliza / SAK / GOAT |

## Still operator-owned

1. **Official MCP Registry** — `mcp-publisher login github && mcp-publisher publish ./agent/crew-mcp/server.json`
2. **Glama** — GitHub OAuth at https://glama.ai (Add MCP Server)
3. **awesome-mcp-servers** — finish https://github.com/punkpeye/awesome-mcp-servers/pull/16008
4. **llmstxt.site** — submit after deploy
5. **Solana agent registry** — needs funded wallet OK (`docs/register-solana-agent.md`)
6. **@CrewPayHQ claim posts** — approve drafts via `GET /api/kols/mentions/drafts` then post manually
7. **Credibility** — either fund buyback cron (`CREW_BUYBACK_MINT` + key, dry-run off) **or** keep fee-share-only wording; land one launch with `lockPath=jito-bundle`

## CP findings

- CP-4, CP-8, CP-9: fixed (docs)
- CP-5, CP-6, CP-7: fixed in code — prove live on next crank/remit sync
