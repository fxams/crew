# Deploy CREW

## Production (Render) — **https://app.crewpay.dev**

| Field | Value |
| --- | --- |
| Static site | **`crewpay`** → https://app.crewpay.dev (also apex `crewpay.dev`) |
| API | **`crewpay-api`** → https://crewpay-api.onrender.com |
| Database | **`crewpay-db`** (Postgres) — coins, remits, 1500 KOLs |
| Buyback cron | **`crewpay-buyback`** hourly (`CREW_BUYBACK_*` secrets) |
| Dashboard (site) | https://dashboard.render.com/static/srv-db32invavr4c739imk00 |
| On Render subdomain | **Disabled** for the static site |
| App root | `agent/crew` |
| Vite `base` | `/` (`VITE_BASE_PATH`) |
| Routes | `/` home · `/launch` launch desk (SPA rewrite `/* → /index.html`) |
| Blueprint | `/render.yaml` at repo root |

Auto-deploy: every push to **`main`** (after GitHub repo is connected in Render).

### If Manual Deploy “does nothing” / site stays old

Live HTML still showing `last-modified` from hours ago means **no successful new deploy** was published (or Auto-Deploy is off).

Check these in order on https://dashboard.render.com/static/srv-db32invavr4c739imk00 :

1. **Events / Deploys** — open the latest deploy. Is it **Live** or **Build failed**?  
   - Failed → open **Logs** (often OOM / `npm test` / missing Node).  
   - Blueprint build command no longer runs tests on Render (tests stay in GitHub Actions).
2. **Settings → Auto-Deploy** — must be **On Commit** (not **Off**).  
   - **Deploy a specific commit** in the UI **disables** auto-deploys — turn Auto-Deploy back **On**.  
   - Avoid **After CI Checks Pass** unless a required check always reports on `main`.
3. **Settings → Build & Deploy** — Branch = `main`, Root Directory = `agent/crew`.  
   - **Publish directory must be `dist`** (relative to Root Directory → publishes `agent/crew/dist`).  
     Do **not** set Publish Directory to `agent/crew/dist` when Root Directory is already `agent/crew` — that looks for a nested path and leaves the previous bundle live.  
   - Build command should be:  
     `rm -rf dist && export VITE_BASE_PATH=/ VITE_SITE_URL=https://app.crewpay.dev && npm ci --legacy-peer-deps && npm run build`
4. **Manual Deploy → Clear build cache & deploy** again after fixing the above.
5. Confirm deploy: home hero should show **`v2.5.2`**. Hard-refresh (CDN `s-maxage=300`).

**Required once (agent cannot do this):** Render → `crewpay` → Settings → Deploy Hook → copy URL → GitHub repo secret `RENDER_DEPLOY_HOOK`. Without it, `.github/workflows/deploy-render.yml` is a no-op.

**Reference build (already correct):** https://fxams.github.io/crew/ — home has no form; launch is at `/crew/launch`.

### Render environment variables

Set in the Render dashboard (or via API). **Do not commit API keys to git.**

| Variable | Production value |
| --- | --- |
| `NODE_VERSION` | `22` |
| `VITE_BASE_PATH` | `/` |
| `VITE_SITE_URL` | `https://app.crewpay.dev` |
| `VITE_CREW_BUYBACK_WALLET` | **Required** — Solana treasury for 25% CREW buyback fee-share |
| `VITE_CREW_API_URL` | `https://crewpay-api.onrender.com` |
| `VITE_CREW_API_KEY` | Same as API `CREW_API_KEY` (write sync) |
| `VITE_RPC_URL` | Helius / Alchemy mainnet URL (recommended) |
| `VITE_PINATA_JWT` | Optional metadata upload fallback |

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
Apex **crewpay.dev** can stay attached to the same static site (or URL-redirect to `app`).

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

Notes:

- Custom-domain CNAME to `*.onrender.com` is fine even when the public onrender URL is disabled — users hit `app.crewpay.dev`, not the onrender hostname.
- After adding `app`, update **crewpay-api** env `CORS_ORIGINS` if the dashboard value is not synced from `render.yaml`.
- Optional: registrar URL redirect `@` → `https://app.crewpay.dev` so the apex always lands on the app host.

### Local production check (Render-style)

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

## Legacy mirror (GitHub Pages)

URL: **https://fxams.github.io/crew/**

Workflow `Deploy CREW to GitHub Pages` on `main` builds with `VITE_BASE_PATH=/crew/` and publishes to the `gh-pages` branch. You can disable this workflow once Render is the only public URL.

---

## Production notes

- App is **mainnet-only** — connect Phantom to launch.
- Set `VITE_RPC_URL` for reliable RPC; browser calls to `api.mainnet-beta.solana.com` often return **403**.
- **Metadata upload:** Pump IPFS has no CORS for static hosts. CREW uses Irys (Phantom-signed) by default; optional `VITE_PINATA_JWT` for Pinata.
- Optional X field format: `https://x.com/username` or `@username`.
