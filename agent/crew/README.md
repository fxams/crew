# CREW

Pump.fun desk for CT: launch a coin, tag up to five X handles with a permanent creator-fee split, pick one mode, watch the remits tape.

Not Agency’s AI mind stack. Not X-DESK’s stock / X Money rails. The thin product: **tag crew → they get paid**.

## Run

```bash
cd agent/crew
npm install
npm run dev
```

Open the printed local URL.

## What’s in here

| Path | Role |
| --- | --- |
| `src/lib/launch.ts` | `demoLaunch` (100% split validation + fake CA) and stubbed `mainnetLaunch` |
| `src/lib/storage.ts` | Local board + tape persistence |
| `src/components/*` | Hero, launch desk, remits tape, modes |
| `PRODUCT.md` | Product + mainnet wiring notes |

## Modes

1. **Fee Split** — permanent bps to tagged handles  
2. **Dip Buyback** — crew share buys dips  
3. **Raid Pool** — crew share funds raids  

## Demo vs mainnet

- UI always uses **demo mint** today.
- Mainnet path is stubbed: Pump IPFS metadata → createV2 / fee-share → wallet sign. See `PRODUCT.md`.
