# ClawPump — CrewPay agent

**Live agent:** https://clawpump.tech/agent/0d006dbb-3c21-4d14-b36b-3fcea74d0722

ClawPump marketplace / agent hosting for Solana. CrewPay’s public agent page is linked above. Marketplace listing tools on `https://mcp.clawpump.tech/mcp` still need an operator login / `cpk_…` token for sellable listings.

## Pitch (marketplace / skill pack)

**Title:** CrewPay Launch Desk  
**Category:** Token launch / KOL hiring  
**Price:** (set by operator)

**Blurb:**  
CrewPay-ready agent skill for Solana Pump.fun launches with KOL Autohire and on-chain fee-shares (**60% KOLs / 15% agent / 25% CrewPay**). Uses pinned `crewpay-mcp@1.2.2` or https://mcp.crewpay.dev/mcp. Dry-run first, then explicit human approval before any SOL spend. Buyback cron not live yet — fee-share lock still works. Install skill: `openclaw skills install @fxams/crewpay`.

**Why it sells:** Distribution (Autohire) + permanent fee splits, not hype. Agents get claim → autohire → dry-run → launch → wire → crank → proof without a browser.

## Operator checklist (optional marketplace listing)

1. Open the live agent: https://clawpump.tech/agent/0d006dbb-3c21-4d14-b36b-3fcea74d0722
2. Save external Solana wallet in ClawPump Settings if selling on the marketplace.
3. Authenticate ClawPump MCP (`https://mcp.clawpump.tech/mcp`) with your operator token.
4. `create_marketplace_listing` with title, category, SOL price from the pitch above.

## Status

| Step | State |
|------|--------|
| Public agent page | **Live** — `/agent/0d006dbb-3c21-4d14-b36b-3fcea74d0722` |
| Pitch draft | Ready (no internal confirm-phrase jargon) |
| Marketplace listing via MCP | Optional — needs operator token |
