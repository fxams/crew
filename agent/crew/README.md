# CREW

**Launch with your crew. Fees hit their wallets. Handles hit the tape.**

Production Pump.fun fee desk on **Solana mainnet**.

## What it does

1. Connect Phantom
2. Create a Pump coin on mainnet
3. Tag up to 5 X handles + fee-recipient wallets
4. Pick a desk mode: **Fee Split**, **Dip Buyback**, or **Raid Pool**
5. Lock permanent on-chain fee-share and crank remits to the public tape

Live: **https://fxams.github.io/crew/**

**Edge vs [Agency](https://www.agencypad.fun):** they route 100% of fees to an AI mind + burn $AGENCY. CREW routes fees to named wallets you lock at launch — **0% platform cut**.

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

## Mainnet path

Phantom → Pump IPFS → `createV2` / `createV2AndBuy` → `createFeeSharingConfig` + `updateFeeSharesV2` → pump.fun URL.

Pump social fee PDAs support GitHub only today — CREW uses **wallet-based** on-chain splits; X handles are display/tape identity.

See `PRODUCT.md` and `src/lib/pump/`.
