# CREW

**Launch with your crew. Fees hit their X.**

A non-sophisticated Pump.fun launch desk inspired by:

- [Agency](https://x.com/tryagency) / [agencypad.fun](https://www.agencypad.fun/) — living tokens with AI minds funded by creator fees
- [X-DESK](https://x.com/xdeskcash) / [xdesk.cash](https://xdesk.cash) — token launches that remit creator fees to X accounts

CREW keeps only the part CT actually uses on day one:

1. Create a Pump coin
2. Tag up to 5 X handles with permanent fee splits
3. Pick one desk mode: **Fee Split**, **Dip Buyback**, or **Raid Pool**
4. Watch remits on a public tape

## Run locally

```bash
cd agent/crew
npm install
npm run dev
```

## Production build

```bash
cd agent/crew
npm ci
npm run build
npm run preview
```

## Deploy (Render)

See [`DEPLOY.md`](./DEPLOY.md). Blueprint at repo root: [`render.yaml`](../../render.yaml).

## Demo vs mainnet

The Launch button is a **production demo flow** (strict validation + fake mint + tape print). Real deploy path:

1. Upload metadata via Pump IPFS
2. Build `createV2` / `createV2AndBuy` with `@pump-fun/pump-sdk`
3. Configure fee sharing for crew handles
4. Sign with user wallet; show `https://pump.fun/<mint>`

See `src/lib/launch.ts`.
