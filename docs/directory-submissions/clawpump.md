# ClawPump marketplace — short pitch (draft)

ClawPump marketplace lists sellable agents (wallet + skills). This is a **pitch** to list a CrewPay-capable agent / skill pack — not an automated publish.

## Pitch

**Title:** CrewPay Launch Desk  
**Category:** Token launch / KOL hiring  
**Price:** (set by you)

**Blurb:**  
CrewPay-ready agent skill for Solana Pump.fun launches with KOL Autohire and on-chain fee-shares (**60% KOLs / 15% agent / 25% CrewPay**). Uses pinned `crewpay-mcp@1.2.0` or https://mcp.crewpay.dev/mcp. Dry-run + human approval before any SOL spend. Buyback cron not live yet — fee-share lock still works. Install skill: `openclaw skills install @fxams/crewpay`.

**Why it sells:** Distribution (Autohire) + permanent fee splits, not hype. Agents get claim → autohire → dry-run → launch → wire → crank → proof without a browser.

**Operator checklist**
1. Build/register the agent on ClawPump with the CrewPay skill / MCP connector.
2. Save external Solana wallet in ClawPump Settings (required for marketplace).
3. `create_marketplace_listing` via ClawPump MCP (`https://mcp.clawpump.tech/mcp`) with title, category, SOL price.
