# CREW custom domains

Canonical production hostnames (prefer these everywhere):

| Surface | Canonical | Legacy alias (still works) |
|---------|-----------|----------------------------|
| Site / desk | `https://crewpay.dev` | `https://app.crewpay.dev` (optional) |
| Agent API | `https://api.crewpay.dev` | `https://crewpay-api.onrender.com` |
| MCP HTTP | `https://mcp.crewpay.dev/mcp` | `https://crewpay-mcp.onrender.com/mcp` |

Do **not** point the apex `crewpay.dev` at the API — it serves the static SPA.

## DNS (Namecheap / registrar-servers.com)

Add these records, then wait for Render to verify + issue TLS:

| Type | Host | Value | Proxy |
|------|------|-------|-------|
| CNAME | `api` | `crewpay-api.onrender.com` | DNS only (off) until verified |
| CNAME | `mcp` | `crewpay-mcp.onrender.com` | DNS only (off) until verified |

Remove any conflicting `AAAA` records for those hosts.

Optional (site already on apex):

| Type | Host | Value |
|------|------|-------|
| CNAME / ALIAS | `app` | `crewpay.onrender.com` or your static service subdomain |
| CNAME | `www` | `crewpay.dev` (or static onrender host) |

## Render dashboard

Custom domains are attached on:

- `crewpay-api` → `api.crewpay.dev`
- `crewpay-mcp` → `mcp.crewpay.dev`
- `crewpay` (static) → `crewpay.dev` (verified)

After DNS propagates, click **Verify** (or wait for auto-verify). Certificates are automatic.

## Safe cutover

1. Add DNS CNAMEs (above).
2. Confirm `https://api.crewpay.dev/api/healthz` and `https://mcp.crewpay.dev/healthz` return 200.
3. Merge / deploy code that advertises the custom domains (this repo).
4. Keep Render `*.onrender.com` URLs — listed as `aliases` in `/api/agent` so existing agents do not break.
5. Set `VITE_CREW_API_URL=https://api.crewpay.dev` on the static service when ready (code default already matches).

## Env defaults

- Site: `VITE_CREW_API_URL` → `https://api.crewpay.dev`
- MCP service: `CREW_API_URL` → `https://api.crewpay.dev`
- CORS stays origin-based (`crewpay.dev` / `app.crewpay.dev`) — API host does not need to be listed.
