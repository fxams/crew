# CREW

**Launch with your crew. Fees hit their wallets. Handles hit the tape.**

A Pump.fun fee desk inspired by:

- [Agency](https://x.com/tryagency) / [agencypad.fun](https://www.agencypad.fun/)
- [X-DESK](https://x.com/xdeskcash) / [xdesk.cash](https://xdesk.cash)

## What it does

1. Create a Pump coin (demo or Solana mainnet)
2. Tag up to 5 X handles + fee-recipient wallets
3. Pick a desk mode: **Fee Split**, **Dip Buyback**, or **Raid Pool**
4. Lock permanent on-chain fee-share (mainnet) and watch remits on the public tape
5. Crank `distributeCreatorFeesV2` when creator fees accumulate

Live: **https://fxams.github.io/crew/**

## Run locally

```bash
cd agent/crew
npm install --legacy-peer-deps
npm run dev
```

Optional: copy `.env.example` → `.env` and set `VITE_RPC_URL` to a dedicated RPC.

## Test / build

```bash
npm test
npm run build
npm run preview
```

## Demo vs mainnet

| Path | Behavior |
|------|----------|
| **Demo** | Strict validation + fake mint + local tape (no wallet) |
| **Mainnet** | Phantom → Pump IPFS → `createV2` → fee-share config → pump.fun URL |

Pump social fee PDAs support GitHub only today — CREW uses **wallet-based** on-chain splits; X handles are display/tape identity.

See `PRODUCT.md` and `src/lib/pump/`.
