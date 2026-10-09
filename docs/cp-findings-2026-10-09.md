# CrewPay CP findings — code response (2026-10-09)

Source report: mainnet agent launch findings (STRAW2GOLD … PRAYDOG) prepared 10:50 UTC.

| ID | Fix in this change |
|----|--------------------|
| **CP-1** | Sequential responses include `preLockCreatorFeesLamports` (+ warning). Request body `atomicRequired: true` (or `CREW_ATOMIC_REQUIRED=1`) refuses sequential fallback. |
| **CP-2** | `sendBundle` now passes `{ encoding: "base64" }` (Jito default is base58 — root cause of “transaction #0 could not be decoded”). Single-tx still needs operator `CREW_LOOKUP_TABLE` for ≤1232 bytes. |
| **CP-3** | API `narrative.ts` now demotes known-bad X (`oxrxbt` / `oxr`) by −48 and labels `pumpFollowers` (desk path matched). |
| **CP-4** | OpenAPI + discovery + llms: crank `x-launcher-key` optional; falls back to `CREW_OPS_KEY`. |
| **CP-5** | Already fixed in `e161d62` (sweep+distribute). |
| **CP-6/7** | Remit parser adds fee back for fee-payer shareholders; prefers adjusted meta deltas (re-sync remits to refresh old rows). |
| **CP-8** | `openapi.json` documents `/api/kols`, `/coins`, `/board`, `/remits`, `/buybacks`, `/webhooks`. |
| **CP-9** | Launch `coin.launchedAt` prefers create-tx `blockTime` when RPC returns it; discovery notes precision. |
| **CP-10** | `GET /api/agent` → `build.commit` / `commitShort` / `deployedAt` (+ `X-Crew-Build` header) from Render env. |

## Still operator-owned

```bash
# Render → crewpay-api Environment
CREW_OPS_KEY=<base58 ops wallet>          # crank without launcher secret
CREW_LOOKUP_TABLE=<alt pubkey>            # helps a bit; create+lock often still >1232
CREW_JITO_TIP_LAMPORTS=1000000            # 0.001 SOL — low tips get accepted but not landed
# Only after a live lockPath=jito-bundle:
CREW_ATOMIC_REQUIRED=1                    # or per-request atomicRequired: true
```

**2026-10-09 TSYPA:** `CREW_ATOMIC_REQUIRED=1` blocked launches when Jito accepted a bundle that never landed (confirm timeout; sig absent on RPC) and single-tx stayed 1520–1827 bytes even with ALT. Atomic required was set back to `0` until jito-bundle is reliable; tip raised + multi-region broadcast + inflight status polling.

## Verify after deploy

1. `GET /api/agent` → `build.commitShort` matches this commit; notes mention `encoding=base64`.
2. Launch (or dry-run path that would have used Jito) → expect `lockPath: "jito-bundle"` (not sequential with decode errors).
3. `POST /api/agent/autohire` meme brief → `#1` is not `@oxrxbt`.
4. Re-sync remits from desk/chain indexer to refresh CP-6/7 rows.
