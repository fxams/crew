# KOL program (influence-style onboarding)

Off by default. Enable with `KOL_PROGRAM_ENABLED=1` on **crewpay-api** and `VITE_KOL_PROGRAM_ENABLED=1` on the static site build.

## Env vars (non-secret)

| Variable | Purpose |
| --- | --- |
| `KOL_PROGRAM_ENABLED` | `1` / `true` — mount `/api/kol-program/*` |
| `KOL_PROGRAM_FOUNDER_CAP` | First N KOLs get a founding number (default `100`) |
| `CREWPAY_HQ_X_HANDLE` | Handle for daily tasks (default `CrewPayHQ`) |
| `X_CLIENT_ID` | X OAuth 2.0 app (PKCE) — same as KOL register |
| `X_CLIENT_SECRET` | X OAuth secret (server only) |
| `X_REDIRECT_URI` | `https://api.crewpay.dev/api/kols/register/callback` |

Frontend: `VITE_KOL_PROGRAM_ENABLED=1`

## Points disclaimer

Program points have **no monetary value** (no token, airdrop, or cash). Referral **fee splits** on agent launches remain the existing on-chain map: **60% crew / 15% agent / 5% referrer / 20% treasury** when a referral code is bound (else 60/15/25).

## X API usage (estimate)

Per active KOL per day (rough):

| Call | When | Count |
| --- | --- | --- |
| `GET /2/users/me` | Register / refresh | 1 per sign-in |
| `GET /2/users/:id/tweets` | Task verify (cached 15m) | ≤4 verify taps × 1 call |
| **Total** | | **~2–5 calls/KOL/day** |

100 active KOLs ≈ **200–500** X API reads/day. Register spikes add 1 `users/me` per new KOL.

## Routes

- `GET /api/kol-program/status`
- `GET /api/kol-program/leaderboard`
- `GET /api/kol-program/card/:handle.svg`
- `POST /api/kol-program/tasks/:taskId/verify` (KOL session cookie)
- Admin ( `CREW_API_KEY` ): `GET/PUT /api/kol-program/admin/tasks`, `GET /api/kol-program/admin/flagged`, `POST /api/kol-program/admin/revoke/:xUserId`
