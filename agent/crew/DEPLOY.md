# Deploy CREW on Render

## Service

| Field | Value |
| --- | --- |
| Type | Static Site |
| Repo | `fxams/crew` |
| Branch | `main` (or this production branch until merged) |
| Root directory | `agent/crew` |
| Build command | `npm ci && npm run build` |
| Publish directory | `dist` |

Blueprint: repo-root [`render.yaml`](../../render.yaml).

## Custom domain

1. Render → CREW static site → **Settings → Custom Domains → Add**
2. Enter your domain (e.g. `crew.example.com` or apex `example.com`)
3. DNS at your registrar:
   - **Subdomain:** `CNAME` → `crew.onrender.com` (or the target Render shows)
   - **Apex:** follow Render’s A/ALIAS records for the account
4. Wait for TLS to provision (usually a few minutes)

## API deploy (agent)

Set secret `RENDER_API_KEY` (Render Dashboard → Account Settings → API Keys).

Then the agent can create/update the static site and attach the domain via Render’s API.

## Demo vs mainnet

Production UI ships the **demo mint** (100% crew split validation + fake CA).  
Mainnet path remains stubbed in `src/lib/launch.ts` (`mainnetLaunch`).
