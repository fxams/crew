# CREW API

Postgres-backed API for CREW launches, remits, KOL directory, and buyback cron.

## Services (Render)

| Service | Role |
|---------|------|
| `crewpay-db` | Postgres 16 |
| `crewpay-api` | Express API (`npm start`) |
| `crewpay-buyback` | Cron → `npm run buyback` |

## Endpoints

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/healthz` | public |
| GET | `/api/board` | public |
| GET | `/api/coins` | public |
| PUT | `/api/coins` | `x-crew-api-key` |
| GET | `/api/remits` | public |
| POST | `/api/remits` | `x-crew-api-key` |
| GET | `/api/kols?q=` | public |

## Local

```bash
cd agent/crew-api
cp .env.example .env   # set DATABASE_URL + CREW_API_KEY
npm ci
npm run migrate
npm run seed:kols      # loads ../crew/src/lib/pump/kol-db.json
npm run dev
```

## Buyback cron secrets (never `VITE_*`)

- `CREW_BUYBACK_PRIVATE_KEY`
- `CREW_BUYBACK_MINT`
- `CREW_BUYBACK_MAX_SOL`
- `RPC_URL`
