# KOL registration QA report

Scope: `/register`, X OAuth recovery, Telegram login + desk channel verify, wallet connect (Phantom / Privy / in-app browse links), handle lookup, returning users, and `/kol/:handle` desk.

## Environments exercised

| Surface | How |
| --- | --- |
| Desktop Chrome | Playwright `desktop-chrome` + manual Vite against production API |
| iPhone 12 (Safari UA) | Playwright `mobile-safari` |
| Pixel 5 (Chrome UA) | Playwright `mobile-chrome` |
| crewpay.dev (live) | Smoke: `/register` loads, `GET /api/kols/register/status` returns `xOauth` + Telegram + Privy flags (no secrets logged) |

Full X/Telegram OAuth completion still requires real user accounts; Playwright mocks API responses for deterministic UI paths.

## Matrix

| Path | Expected recovery | Automated |
| --- | --- | --- |
| Fresh `/register` | Register with X, Telegram, Connect wallet | Yes |
| X already-used | Start over + Check; stuck state persisted | Yes |
| X expired | Start over + Check | Yes |
| X cancelled (`access_denied`) | Start over; no auto-restart loop | Yes |
| X double-tap Register | Single `/register/start` | Unit guard (`registerInFlightRef`); manual |
| X back / pending | Check visible; polls progress by `sid` | Yes (pending Check visible) |
| Handle lookup — missing | “Go to register” recovery | Yes |
| Handle lookup — found | Navigate to desk | Partial (API mock) |
| Connect wallet | Connect modal | Yes |
| Mobile browse links | Phantom, Solflare, Backpack | Yes (mobile projects) |
| Returning user `?registered=1&handle=` | Open Desk card | Yes |
| Desk registered banner `from=x` | Wallet Check hint + link back | Yes |
| Desk missing | Register CTA | Yes |
| Telegram channel verify error | Try again recovery on desk | Yes |
| Privy embedded wallet | Shown when API reports `privy.enabled` | Status mock (no Privy login in CI) |

## Bugs found and fixed (this PR)

1. **Cancelled X OAuth** treated as generic failure — added `xoauth=cancelled`, `classifyStuckXOauth`, and skip auto-restart for user-cancelled flows.
2. **Double-tap Register with X** could fire multiple starts — `registerInFlightRef` + busy guard.
3. **Handle lookup** navigated to empty desk with no guidance — API check + `RegisterRecovery` with register link.
4. **Network errors** surfaced as raw “Failed to fetch” — `humanizeRegisterError` + recovery actions on register errors.
5. **Desk Telegram verify failures** only showed a hint — `RegisterRecovery` with retry on desk card.
6. **Mobile wallet path** missing Backpack universal link — `backpackBrowseUrl` + register hint links.
7. **Recovery UI** duplicated hint + error — consolidated into `RegisterRecovery` with test ids for e2e.

Prior branch work (merged in tree): X-only empty wallet “already used”, `progress?sid=`, `SameSite=None` session cookie, Start over persistence.

## How to run

```bash
cd agent/crew
npm ci
npm test
npm run test:e2e
```

Playwright starts Vite on port 4173 (override with `PLAYWRIGHT_PORT`).
