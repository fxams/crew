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
| Dip Buyback | Crew % + desk reserve that buys dips when rules fire |
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

## Production status (platform)

- App: `agent/crew` (Vite + React + TypeScript)
- **Demo** — validates 1–5 handles, 100% split, localStorage board + tape
- **Mainnet** — Phantom wallet → Pump IPFS → `createV2` / `createV2AndBuy` → `createFeeSharingConfig` + `updateFeeSharesV2`
- X handles are **tape identity**; fee recipients are **Solana wallets** (Pump social fee PDAs officially support GitHub only)
- Buyback / Raid desk reserve (20% / 25%) routes to the launcher wallet
- **Crank remits** — `distributeCreatorFeesV2` for mainnet mints
- Persistence: `localStorage` board (`crew.platform.v1`)
- Hosting: **GitHub Pages** — https://fxams.github.io/crew/ — see `DEPLOY.md`
- Optional RPC: `VITE_RPC_URL` (see `.env.example`)
