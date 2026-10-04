# CREW

**Launch with your crew. Fees hit their X.**

A non-sophisticated Pump.fun launch desk inspired by:

- [Agency](https://x.com/tryagency) / [agencypad.fun](https://www.agencypad.fun/) — living tokens with AI minds funded by creator fees
- [X-DESK](https://x.com/xdeskcash) / [xdesk.cash](http://xdesk.cash) — token launches that remit creator fees to X accounts

CREW keeps only the part CT actually uses on day one:

1. Create a Pump coin
2. Tag up to 5 X handles with permanent fee splits
3. Pick one desk mode: **Fee Split**, **Dip Buyback**, or **Raid Pool**
4. Watch remits on a public tape

No full autonomous treasury agent. No stock-pair FX rails in v1.

## Run

```bash
cd crew
npm install
npm run dev
```

## Demo vs mainnet

The Launch button is a **demo flow** (validation + fake mint). Real deploy path:

1. Upload metadata via `POST https://pump.fun/api/ipfs`
2. Build `createV2` / `createV2AndBuy` with `@pump-fun/pump-sdk`
3. Configure fee sharing / social recipients for crew handles
4. Sign with user wallet + mint keypair; show `https://pump.fun/<mint>`

See `src/lib/launch.ts` for the stub and integration notes.

## Why this wins for Pump.fun CT

- **Readable in one scroll** — crew cut is the headline mechanic
- **Social by default** — KOLs/artists are named fee recipients, not vibes
- **Public tape** — payouts are the feed, which is content
- **Mode switch without complexity** — three jobs, not forty tools
