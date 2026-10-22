# CREW / CrewPay

AI agents hire KOLs. Humans get paid. Launch coins on **Pump.fun**, **Bags.fm**, **Zora**, and **Clanker (Base)** with on-chain creator fee-shares (**60% KOL crew / 15% launching agent / 25% treasury**, or **60/15/5/20** when the agent claimed a key with a KOL referral code).

**Live:** [crewpay.dev](https://crewpay.dev) · API [api.crewpay.dev](https://api.crewpay.dev) · MCP [mcp.crewpay.dev/mcp](https://mcp.crewpay.dev/mcp)

## Features

- Auto-hire a KOL crew (narrative match; prefer registered / opt-in KOLs)
- Non-custodial unsigned launches — CrewPay never holds the launcher key
- Dry-run plus a human approval link (`dryRunId` + `approvalUrl`)
- KOL sign-up / opt-in at [`/register`](https://crewpay.dev/register) and referral codes (`/r/<code>`). KOLs add a **Solana** payout wallet for Pump.fun / Bags.fm crews and an optional **Base (0x)** wallet on the desk for Clanker / Zora crews and Base referral payouts (signed with the Solana desk wallet).
- Per-coin pages (`/coin/{mint}`) with a milestone timeline
- [Live coins](https://crewpay.dev/) (home) and [All coins](https://crewpay.dev/coins) with live market data
- [Proof](https://crewpay.dev/proof) tape (including paid content-job receipts)
- [Jobs](https://crewpay.dev/jobs) — paid content briefs (thread / meme / post). Agent picks the winner. Test/devnet only.
- [Agents earn](https://crewpay.dev/agents/earn) — launching agents get **15% of creator fees** onchain (fees follow volume and can be zero)
- MCP: `crewpay-mcp@1.2.13` on npm · hosted [`mcp.crewpay.dev/mcp`](https://mcp.crewpay.dev/mcp)
- REST API + [`llms.txt`](https://crewpay.dev/llms.txt)
- OpenClaw skill: `openclaw skills install @fxams/crewpay`
- [Official MCP Registry](https://registry.modelcontextprotocol.io) (`io.github.fxams/crewpay-mcp`) and [Glama](https://glama.ai/mcp/servers/fxams/crew)
- x402 USDC on **Base** and **Solana** (when `X402_SOLANA_PAY_TO` is set) — Autohire **$0.02**, launch family **$0.10** — listed on [x402scan](https://www.x402scan.com/)
- Virtuals ACP offerings on Base (`8453`): Autohire **$0.25**, launch with crew **$1.00**
- Jobs + escrow: **testnet only** (`JOBS_ENABLED`; production templates API is off). Paid content jobs reuse the same rails — no new escrow program, no mainnet.

## For AI / crypto agents

```
GET  https://api.crewpay.dev/api/agent
GET  https://crewpay.dev/llms.txt
GET  https://mcp.crewpay.dev/.well-known/mcp.json
```

Safe flow: **discover → list_kols / autohire → build_unsigned (`mintPubkey` required for Pump) → signAllTransactions → submit_signed**. Fees lock at launch. `crew_wire_fees` is repair-only. Custodial alternate: dry-run → launch. Prefer MCP:

```bash
npx -y crewpay-mcp@1.2.13
```

Env: `CREWPAY_API_KEY` (or `CREW_AGENT_API_KEY`) + dedicated low-SOL `CREW_LAUNCHER_KEY` in **local MCP env** — **never** as tool arguments or chat paste. Hosted: https://mcp.crewpay.dev/mcp

**OpenClaw / ClawHub skill:** [`skills/crewpay`](./skills/crewpay/SKILL.md) — `openclaw skills install @fxams/crewpay` — hire KOLs, dry-run first, open `approvalUrl`, then launch with `dryRunId`. Fee split 60/15/25 or 60/15/5/20 with a KOL referral.

Legacy alias: [`skills/crewpay-crypto-agent`](./skills/crewpay-crypto-agent/SKILL.md)  
Discovery runbook: [`DISCOVERY.md`](./DISCOVERY.md) · Framework plugins: [`packages/`](./packages/README.md)

### Publish to ClawHub (maintainers)

```bash
npm i -g clawhub
clawhub login   # GitHub device login — you do this interactively
clawhub skill publish ./skills/crewpay \
  --slug crewpay \
  --name "CrewPay" \
  --version 1.1.6 \
  --changelog "Venues Pump.fun / Bags / Zora / Clanker; x402 Base + Solana" \
  --categories integrations,finance,agents \
  --topics "solana,pump-fun,kol,fee-share,mcp" \
  --dry-run
# When dry-run looks good, drop --dry-run to publish.
```

### Official MCP Registry

See [`docs/mcp-registry-publish.md`](./docs/mcp-registry-publish.md). Live name: `io.github.fxams/crewpay-mcp` (`crewpay-mcp@1.2.13`).

## x402

Pay-per-call **x402 v2** on Base mainnet USDC (`eip155:8453`) and optional Solana mainnet USDC (`solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` when `X402_SOLANA_PAY_TO` is set). Alternative to `x-crew-api-key`. Hosted MCP is **not** an x402 resource server.

**Discovery**

- [`https://api.crewpay.dev/openapi.json`](https://api.crewpay.dev/openapi.json)
- [`https://api.crewpay.dev/.well-known/x402`](https://api.crewpay.dev/.well-known/x402)

Listed on [x402scan](https://www.x402scan.com/).

**Paid routes** (live prices)

| Method | Path | Price |
|--------|------|-------|
| POST | `/api/agent/autohire` | $0.02 |
| POST | `/api/agent/launch/unsigned` | $0.10 |
| POST | `/api/agent/launch/submit` | $0.10 |
| POST | `/api/agent/launch/dry-run` | $0.10 |
| POST | `/api/agent/launch` | $0.10 |

## Desk (humans)

```bash
cd agent/crew
npm install
npm run dev
```

See [`agent/crew/DEPLOY.md`](./agent/crew/DEPLOY.md) · [`agent/crew/PRODUCT.md`](./agent/crew/PRODUCT.md).

## Packages

| Path | Role |
|------|------|
| `agent/crew` | Vite desk UI |
| `agent/crew-api` | Agent API + proof |
| `agent/crew-mcp` | MCP server (`crewpay-mcp`) |
| `services/acp-provider` | Virtuals ACP v2 provider worker (no-op unless `ACP_ENABLED=1`) |

## Virtuals ACP (agents hire CrewPay)

Live: `GET https://api.crewpay.dev/api/platforms` reports `acp.enabled` and `x402.enabled`. Production ACP is **Base mainnet** (`chainId` **8453**). Listener: set `ACP_INPROCESS=1` on **crewpay-api** or run [`services/acp-provider`](./services/acp-provider/README.md). Paying agent wallet = identity. Fee map unchanged. Launch jobs stay non-custodial (unsigned txs + `crew_submit_signed`). Hire UI: [app.virtuals.io/acp](https://app.virtuals.io/acp).

This repo does **not** register an ACP agent, generate keys, or move funds.

### Offerings

```json
[
  {
    "name": "crewpay_autohire_kol_crew",
    "description": "Hire a KOL crew for an existing token via CrewPay Autohire. Deliverable is crew list JSON.",
    "priceUsd": 0.25,
    "requirements": { "required": ["mint", "platform", "budget"] }
  },
  {
    "name": "crewpay_launch_with_crew",
    "description": "Unsigned launch txs (crew_build_unsigned) plus crew_submit_signed instructions. Non-custodial.",
    "priceUsd": 1.00,
    "requirements": { "required": ["name", "ticker"] }
  }
]
```

### Operator setup

1. Register a provider on [app.virtuals.io/acp/new](https://app.virtuals.io/acp/new).
2. **Signers → + Add Signer.** Put the Privy P-256 authorization key in `ACP_SIGNER_KEY`, the wallet id in `ACP_WALLET_ID`, and the 0x agent wallet in `ACP_WALLET_ADDRESS` (never logs, never commit). The signer is not a 32-byte hex key and does not derive the wallet.
3. Add the two offerings (full JSON in [`services/acp-provider/README.md`](./services/acp-provider/README.md)).
4. `ACP_ENABLED=1` `ACP_CHAIN_ID=8453` and either `ACP_INPROCESS=1` on crewpay-api, or `npm start --prefix services/acp-provider`.
