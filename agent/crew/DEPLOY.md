# Deploy CREW on GitHub Pages

Live URL: **https://fxams.github.io/crew/**

## How it publishes

GitHub Pages is configured for the **`gh-pages`** branch (legacy source).

On every push to `main`, workflow `Deploy CREW to GitHub Pages`:

1. Builds `agent/crew` (`npm ci --legacy-peer-deps && npm test && npm run build`)
2. Publishes `agent/crew/dist` to the `gh-pages` branch via `peaceiris/actions-gh-pages`

Manual publish (from a clean build):

```bash
cd agent/crew
npm ci --legacy-peer-deps
npm test
npm run build
# then copy dist → gh-pages branch and push
```

## Vite base

| Field | Value |
| --- | --- |
| App root | `agent/crew` |
| Vite `base` | `/crew/` |
| Publish | `gh-pages` branch root |

## Local production check

```bash
cd agent/crew
npm ci --legacy-peer-deps
npm test
npm run build
npm run preview
```

Open the printed URL (assets load under `/crew/`).

## Production notes

- App is **mainnet-only** — connect Phantom to launch.
- Set `VITE_RPC_URL` for production throughput (public RPC rate-limits).
- Fee recipients are Solana wallets; X handles print on the tape only.
