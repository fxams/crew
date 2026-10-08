# Deploy

Custom domains: see [DOMAINS.md](./DOMAINS.md) (`api.crewpay.dev` / `mcp.crewpay.dev`).
 CREW

## Production (Render only) — **https://app.crewpay.dev**

GitHub Pages is **decommissioned**. Do not use `fxams.github.io/crew`.

| Field | Value |
| --- | --- |
| Static site | **`crewpay`** → https://app.crewpay.dev (also apex `crewpay.dev`) |
| API | **`crewpay-api`** → https://api.crewpay.dev |
| Database | **`crewpay-db`** (Postgres) — coins, remits, 1500 KOLs |
| Buyback cron | **`crewpay-buyback`** hourly (`CREW_BUYBACK_*` secrets) |
| Dashboard (site) | https://dashboard.render.com/static/srv-db32invavr4c739imk00 |
| On Render subdomain | **Disabled** for the static site |
| Publish directory | **`render-site`** at **repo root** (committed + rebuilt on deploy) |
| Vite `base` | `/` (`VITE_BASE_PATH`) |
| Routes | `/` home · `/launch` launch desk (SPA rewrite `/* → /index.html`) |
| Blueprint | `/render.yaml` at repo root |

### ⚠️ Wrong service check

`https://crewpay.onrender.com` may show an unrelated older “CrewPay” badminton app. That is **not** this CREW fee-desk service. Always open the static site dashboard link above (or the service whose custom domain is `crewpay.dev`), not a random service named “crewpay”.

### If Manual Deploy leaves the site on an old bundle (e.g. `index-C3DQKFyN.js` / v2.4.0)

Blueprint YAML often does **not** overwrite dashboard Build & Deploy fields. Set them **manually**:

https://dashboard.render.com/static/srv-db32invavr4c739imk00 → **Settings → Build & Deploy**

| Setting | Must be |
| --- | --- |
| Branch | `main` |
| **Root Directory** | **empty** (clear `agent/crew` if present) |
| **Build Command** | `true` (publishes the committed `render-site/`) **or** the multi-line build from `render.yaml` |
| **Publish Directory** | `render-site` |
| Auto-Deploy | **On Commit** |

Then **Manual Deploy → Clear build cache & deploy**.

Confirm:

1. https://crewpay.dev/DEPLOYED_AT.txt shows a fresh UTC timestamp  
2. Home hero shows **`v2.5.4`**  
3. HTML references `index-Fb4Ehr7N.js` (or a newer hash), not `index-C3DQKFyN.js`  
4. Launch form (coin name / ticker) is only on `/launch` — the home page does not mount it

Optional: Deploy Hook URL → GitHub secret `RENDER_DEPLOY_HOOK` for `.github/workflows/deploy-render.yml`.

### Render environment variables

Set in the Render dashboard (or via API). **Do not commit API keys to git.**

| Variable | Production value |
| --- | --- |
| `NODE_VERSION` | `22` |
| `VITE_BASE_PATH` | `/` |
| `VITE_SITE_URL` | `https://app.crewpay.dev` |
| `VITE_CREW_BUYBACK_WALLET` | **Required** — Solana treasury for 25% CREW buyback fee-share |
| `VITE_CREW_API_URL` | `https://api.crewpay.dev` |
| `VITE_CREW_API_KEY` | Same as API `CREW_API_KEY` (write sync) |
| `VITE_RPC_URL` | Helius / Alchemy mainnet URL (recommended) |
| `VITE_PINATA_JWT` | Optional metadata upload fallback |
| `VITE_CREW_MINT` | Optional — $CREW contract address for the hero panel |
| `VITE_CREW_PUMP_URL` | Optional — pump.fun buy link (defaults to `/coin/{mint}`) |
| `VITE_CREW_PRICE_USD` | Optional — hero price placeholder (e.g. `0.0012`) |
| `VITE_CREW_MCAP_USD` | Optional — hero market cap placeholder (e.g. `120k`) |

### API / cron secrets (never `VITE_*`)

| Variable | Service |
| --- | --- |
| `DATABASE_URL` | crewpay-api, crewpay-buyback (from Postgres) |
| `CREW_API_KEY` | crewpay-api |
| `CORS_ORIGINS` | `https://app.crewpay.dev,https://crewpay.dev,https://www.crewpay.dev` |
| `CREW_BUYBACK_PRIVATE_KEY` | crewpay-buyback only |
| `CREW_BUYBACK_MINT` | crewpay-buyback (after $CREW launches) |

### Custom domains

Canonical app URL: **https://app.crewpay.dev**  
Apex **crewpay.dev** can stay attached to the same static site.

In Render → **crewpay** static site → **Custom Domains**, add:

1. `app.crewpay.dev`
2. `crewpay.dev` (optional if you keep the apex)

Then at your DNS host (Namecheap):

| Host | Type | Value |
| --- | --- | --- |
| `app` | **CNAME** | value Render shows for the `app` domain (usually `*.onrender.com`) |
| `@` (apex) | **A** | `216.24.57.1` |
| `www` | **URL redirect** | `https://app.crewpay.dev` (or A `216.24.57.1`) |

Wait for Render to show **Verified** + TLS on `app.crewpay.dev`.

### Refresh committed `render-site/` (maintainers)

```bash
cd agent/crew
export VITE_BASE_PATH=/ VITE_SITE_URL=https://app.crewpay.dev
npm ci --legacy-peer-deps
npm run build
rm -rf ../../render-site && mkdir -p ../../render-site
cp -R dist/. ../../render-site/
date -u +%Y-%m-%dT%H:%M:%SZ > ../../render-site/DEPLOYED_AT.txt
```

### Local production check

```bash
cd agent/crew
export VITE_BASE_PATH=/
export VITE_SITE_URL=https://app.crewpay.dev
npm ci --legacy-peer-deps
npm test
npm run build
npm run preview
```

---

## Production notes

- App is **mainnet-only** — connect Phantom to launch.
- Set `VITE_RPC_URL` for reliable RPC; browser calls to `api.mainnet-beta.solana.com` often return **403**.
- GitHub Pages workflow removed; disable Pages in GitHub → Settings → Pages if it is still enabled.