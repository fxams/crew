# Deploy CREW on GitHub Pages

Live URL (after Pages is enabled): **https://fxams.github.io/crew/**

## One-time setup

1. Repo must allow Pages:
   - **Public** on GitHub Free, or private with GitHub Pro
2. GitHub → **Settings → Pages**
3. **Source:** GitHub Actions
4. Push to `main` (or this production branch) — workflow `Deploy CREW to GitHub Pages` builds `agent/crew` and publishes `dist`

## Build settings (in workflow)

| Field | Value |
| --- | --- |
| App root | `agent/crew` |
| Build | `npm ci && npm run build` |
| Publish | `agent/crew/dist` |
| Vite `base` | `/crew/` |

## Custom domain (optional)

1. Pages → Custom domain → e.g. `crew.yourdomain.com`
2. DNS: `CNAME` → `fxams.github.io`
3. Enable **Enforce HTTPS**

## Local production check

```bash
cd agent/crew
npm ci --legacy-peer-deps
npm test
npm run build
npm run preview
```

Open the printed URL (assets load under `/crew/`).

## Mainnet notes

- Connect **Phantom** in the app; toggle **Mainnet** on the launch desk.
- Set `VITE_RPC_URL` for production throughput (public RPC rate-limits).
- Fee recipients are Solana wallets; X handles print on the tape only.
