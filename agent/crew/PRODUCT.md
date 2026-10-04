# CREW — Product

A Pump.fun desk for CT: launch a coin, tag up to **5 X handles** with a permanent creator-fee split, pick **one mode**, and watch remits on a public tape.

Inspired by [Agency](https://x.com/tryagency) (AI mind funded by fees) and [X-DESK](https://x.com/xdeskcash) (route fees to X). CREW is the thin cut CT will actually use on day one — not the full stack.

## Why this works for Pump CT

- **One-scroll mechanic:** tag crew → they get paid
- **Public tape:** screenshottable remits
- **Three modes,** not Agency’s tool zoo
- **0% platform cut** (same narrative hook as X-DESK)

## Modes (pick one)

| Mode | What fees do |
| --- | --- |
| **Fee Split** | Permanent bps split to tagged X handles |
| **Dip Buyback** | Crew share buys dips on the coin |
| **Raid Pool** | Crew share funds a raid / shill pool |

## Launch flow

### Demo (current default)

`demoLaunch` in `src/lib/launch.ts`:

1. Validate name, ticker, 1–5 crew handles
2. Require **exactly 100%** allocated across crew (bps sum = 10_000)
3. Return a **fake mint / CA** and append the coin + seed remits to local storage

No wallet. No chain. Safe for UI demos.

### Mainnet (stubbed)

`mainnetLaunch` in `src/lib/launch.ts` is intentionally unfinished. Intended path:

1. Upload metadata JSON to **Pump IPFS**
2. Build **createV2** + **fee-share** instructions (`createFeeSharingConfig` → `updateFeeSharesV2` with permanent shareholder bps)
3. Prompt **wallet sign** (Phantom / Solana wallet adapter)
4. Confirm mint, register coin on the CREW board

Wire `@pump-fun/pump-sdk` + wallet adapter when ready. Until then, the UI always calls `demoLaunch`.

## Data

- Coins and remits persist in `localStorage` (`crew.coins`, `crew.remits`)
- Fresh visits seed a small public tape so the board never looks empty

## Out of scope (v0)

- Real Pump SDK / wallet signing
- X Money / Kraken conversion rails
- Autonomous AI minds (Agency)
- Stock / xStock quote pairs (X-DESK)
