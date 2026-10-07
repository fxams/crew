# CREW

**Launch with your crew. Fees hit their wallets. Handles hit the tape.**

Production Pump.fun fee desk on **Solana mainnet**.

## What it does

1. Connect Phantom
2. Create a Pump coin on mainnet
3. Tag up to 5 X / Pump handles — wallets auto-fill from Pump.fun’s user DB when linked
4. Pick a desk mode: **Fee Split**, **Dip Buyback**, **Raid Pool**, or **Agent Hire**
5. Lock permanent on-chain fee-share and crank remits to the public tape

Live: **https://app.crewpay.dev** (Render) · mirror: https://fxams.github.io/crew/

**Agency × CREW:** Agency routes 100% of fees to an AI mind. CREW’s **Agent Hire** mode lets an AI keep 15% ops and **hire KOLs / X accounts** for the rest — permanent wallet fee-share, plus a fixed **25% CREW buyback** on every launch.

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
