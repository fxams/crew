# Deploy CREW

## Production (Render) — **https://crewpay.dev**

| Field | Value |
| --- | --- |
| Host | [Render](https://render.com) static site **`crewpay`** |
| Dashboard | https://dashboard.render.com/static/srv-db32invavr4c739imk00 |
| On Render URL | https://crewpay-ew9i.onrender.com |
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
| `VITE_RPC_URL` | Helius / Alchemy mainnet URL (recommended) |
| `VITE_PINATA_JWT` | Optional metadata upload fallback |

### Custom domain `crewpay.dev`

Domains are registered on the Render service (`crewpay.dev` + `www.crewpay.dev` → apex).

At your DNS host for **crewpay.dev**, add:

| Host | Type | Value |
| --- | --- | --- |
| `@` (apex) | **A** | `216.24.57.1` |
| `www` | **CNAME** | `crewpay-ew9i.onrender.com` |

Render may also show a verification TXT/CNAME in the dashboard under **Settings → Custom Domains** until status is **Verified**. TLS is issued automatically after DNS propagates.

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
