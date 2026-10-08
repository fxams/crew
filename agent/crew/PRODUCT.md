# CREW — product review & scope

## Competitive frame (Agency × CREW)

[Agency](https://www.agencypad.fun) launches Pump coins with an autonomous AI mind + treasury.
**100% of creator fees** route to Agency. CREW competes — and hybrids — on a different axis:

> **AI agents hire crew. KOLs and X accounts get permanent on-chain fee splits. 25% of every launch’s creator fees buy back the CREW platform token. The desk is the remittance machine + public tape.**

### CREW edges vs Agency

| | Agency | CREW |
|--|--|--|
| Who gets fees | AI credits + Agency treasury (+ burn) | **25% CREW buyback** + named human wallets for the rest |
| Agent mode | Mind owns the treasury | Agent keeps **15% ops**; hires KOLs/X for **60%** (after 25% buyback) |
| Control after launch | Mind decides; launcher cannot command | You set hire map, dip rules, raid quests |
| Time-to-pay | Sleeps until ~$20 fees | Crank remits anytime |
| Social proof | Thought logs | Screenshotable remit tape + CT receipts |
| Network | Mainnet | **Mainnet only (production)** |

## Modes

Every mode starts with a fixed **25% CREW buyback** of creator fees.

| Mode | Job |
|------|-----|
| Fee Split | 75% of creator fees to tagged crew wallets |
| Dip Buyback | 20% desk reserve + editable dip rule · 55% crew |
| Raid Pool | 25% pot + editable quest board · 50% crew |
| **Agent Hire** | AI agent brief + hire roles; 15% ops → launcher · 60% hired KOLs |

## Platform (v2.6+ production)

- Phantom → Pump IPFS → `createV2` → permanent fee-share
- Agent Hire: mind label + objective · wallets are the payroll
- **KOL DB**: top 1500 ranked Pump profiles (followers) + wallets + narrative tags + correlation packs
- **Auto-hire**: match token name/ticker/vibe → fill crew wallets from correlated KOLs
- **Agent API**: launch + autohire + status + wire-fees + lock-holder-kol + crank on https://crewpay-api.onrender.com
- **Agent discovery**: `/agents` · `llms.txt` · `AGENTS.md` · `mcp.json` · MCP (`crew_discover` / `crew_autohire` / `crew_launch` / `crew_status` / `crew_wire_fees` / `crew_lock_holder_kol` / `crew_crank_remits` / `crew_proof`) · HTTP MCP `https://crewpay-mcp.onrender.com/mcp`
- **Proof tape**: `/proof` + `GET /api/proof` + buyback run history; hourly Jupiter buyback cron when mint+key set
- **Dip / Raid**: Preview + on-chain Execute (Jupiter dip buy / SOL raid claim) from the desk
- **Webhooks + per-agent keys**: register events; mint scoped agent API keys with launch quotas
- No demo mint path — empty desk until real launches
- Launch templates (incl. Agent hires), scoreboard, desk pulse, CT receipts
- Crank remits via `distributeCreatorFeesV2`
- Hosting: https://app.crewpay.dev / https://crewpay.dev (Render static)

## Explicitly out

- Multi-model autonomous “mind” with API keys in the browser UI
- Prompt firewall / isolated signer / double-entry ledger
- Stock quote pairs + X Money rails
