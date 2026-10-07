# Deploy CREW

## Production (Render) — **https://crewpay.dev**

| Field | Value |
| --- | --- |
| Host | [Render](https://render.com) static site **`crewpay`** |
| Dashboard | https://dashboard.render.com/static/srv-db32invavr4c739imk00 |
| On Render subdomain | **Disabled** — site is only at crewpay.dev |
| App root | `agent/crew` |
| Vite `base` | `/` (`VITE_BASE_PATH`) |
| Publish | `agent/crew/dist` |
| Blueprint | `/render.yaml` at repo root |

Auto-deploy: every push to **`main`** (after GitHub repo is connected in Render).

### Render environment variables

Set in the Render dashboard (or via API). **Do not commit API keys to git.**

| Variable | Production value |
| --- | --- |
| `NODE_VERSION` | `22` |
| `VITE_BASE_PATH` | `/` |
| `VITE_SITE_URL` | `https://crewpay.dev` |
| `VITE_CREW_BUYBACK_WALLET` | **Required** — Solana treasury for 25% CREW buyback fee-share |
| `VITE_RPC_URL` | Helius / Alchemy mainnet URL (recommended) |
| `VITE_PINATA_JWT` | Optional metadata upload fallback |

### Custom domain `crewpay.dev`

DNS is configured; **crewpay.dev** is **verified** on Render with TLS. The default `*.onrender.com` subdomain is **disabled** (`renderSubdomainPolicy: disabled`) — requests to `crewpay-*.onrender.com` return 404.

Expected DNS:

| Host | Type | Value |
| --- | --- | --- |
| `@` (apex) | **A** | `216.24.57.1` |
| `www` | **URL redirect** (or A `216.24.57.1`) | `https://crewpay.dev` |

Do **not** CNAME `www` to `*.onrender.com` while the Render subdomain is disabled — TLS for www will not issue. Prefer a registrar redirect from `www` → apex.

### Local production check (Render-style)

```bash
cd agent/crew
export VITE_BASE_PATH=/
export VITE_SITE_URL=https://crewpay.dev
npm ci --legacy-peer-deps
npm test
npm run build
npm run preview
```

---

## Legacy mirror (GitHub Pages)

URL: **https://fxams.github.io/crew/**

Workflow `Deploy CREW to GitHub Pages` on `main` builds with `VITE_BASE_PATH=/crew/` and publishes to the `gh-pages` branch. You can disable this workflow once Render is the only public URL.

---

## Production notes

- App is **mainnet-only** — connect Phantom to launch.
- Set `VITE_RPC_URL` for reliable RPC; browser calls to `api.mainnet-beta.solana.com` often return **403**.
- **Metadata upload:** Pump IPFS has no CORS for static hosts. CREW uses Irys (Phantom-signed) by default; optional `VITE_PINATA_JWT` for Pinata.
- Optional X field format: `https://x.com/username` or `@username`.
