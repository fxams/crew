# CREW — product review & scope

## What we reviewed

### Agency (`@tryagency` → agencypad.fun)
- Pump launchpad where **every coin gets an AI mind + treasury**
- Creator fees permanently route to Agency
- Mind observes market/holders, researches X/web, buybacks, rewards, contests
- Powerful, but heavy: models, firewall, policy engine, signer, ledger

### X-DESK (`@xdeskcash` → xdesk.cash)
- Launch tokens **paired with SOL / stocks / majors**
- Assign creator fees to **X accounts**, pay out via **X Money** (USD)
- **0% platform fee** narrative
- Desk board shows generated vs paid

## The gap (non-sophisticated use case)

Pump.fun CT does not need the full Agency brain or X-DESK stock/FX stack to feel the magic.

They need:

1. Fast launch that feels native to Pump
2. A reason the coin is not a ghost after block 1
3. Named people getting paid in public
4. A tape they can screenshot into CT

## CREW thesis

> **Tag your crew at launch. Their cut of creator fees is permanent. The desk is just the remittance machine + public tape.**

### v1 modes
| Mode | Job |
|------|-----|
| Fee Split | 100% of creator fees to tagged X crew |
| Dip Buyback | Crew % + desk reserve that buys dips on rules |
| Raid Pool | Fees fund a public pot for holders who post |

### Explicitly out of v1
- Multi-model autonomous “mind”
- Stock quote pairs + Kraken conversion
- X Money rails (can add later; start with SOL remits / claim links)
- Contests, vesting, strategy lab, browser research agents

## Why the community would use it
- **KOL alignment without DMs** — shillers get a real cut on-chain/config
- **Content engine** — every payout is a postable receipt
- **Lower trust friction** — fee map is visible before first trade
- **Still degenspeed** — one form, one click, Pump URL back

## Build status
- Landing + desk board + launch UI shipped as demo app in `/crew`
- Launch button validates crew shares and returns a demo mint
- Mainnet requires wallet connect + Pump SDK + fee-share config
