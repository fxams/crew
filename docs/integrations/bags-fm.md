# Bags.fm launches (Solana)

CrewPay can build **unsigned** Bags.fm launches on the same endpoints as Pump.fun:

- `POST /api/agent/launch/unsigned` with `"platform": "bags"`
- MCP `crew_build_unsigned` (`platform=bags`)
- `POST /api/agent/launch/submit` / `crew_submit_signed` (`platform=bags`)

`platform` defaults to `pumpfun`, so existing clients are unchanged.

## Enablement

Set `BAGS_API_KEY` (Bags public API key from [dev.bags.fm](https://dev.bags.fm)). If it is missing, `platform=bags` returns a clear disabled error. Optional: `BAGS_API_URL` (default `https://public-api-v2.bags.fm/api/v1`).

Do not commit API keys.

## Flow (non-custodial)

1. Prefer explicit `crew[]` from `crew_list_kols` / `GET /api/kols`. Autohire is the fallback. `optInOnly` is optional and **off by default**.
2. Builder calls Bags:
   - `POST /token-launch/create-token-info` (metadata + mint)
   - `POST /fee-share/config` (fee claimers)
   - `POST /token-launch/create-launch-transaction` (create, already mint-signed)
3. CrewPay returns Solana transactions for the **agent to sign**. Nothing is custodial.
4. Sign in order (fee-share config first when `needsCreation`, then create) and submit.

## Fee claimers

The 10,000-bps claimers pool is the same map as Pump.fun:

| Slice | Default | Referred agent key |
| --- | --- | --- |
| Hired KOL crew | **60%** | **60%** |
| Launching agent | **15%** | **15%** |
| Referrer KOL | — | **5%** |
| CrewPay treasury | **25%** (`treasuryBps` 2000–3000) | remainder after 5% |

The launching agent does **not** receive the 60% crew slice.

Bags also registers the fee-share **config payer** as a separate deployer (25% of the gross claimers pool). That is a Bags protocol rule, not a change to the 10,000-bps CrewPay map.

## Claimer limit

Bags allows at most **100** fee claimers. CrewPay counts hired KOLs + launching agent + treasury (+ referrer when bound). Requests above 100 are rejected.

When there are **more than 7** claimers, Bags requires a lookup table. CrewPay attaches the public Bags LUT (`Eq1EVs15EAWww1YtPTtWPzJRLPJoS6VYP9oW9SbNr3yp`) and warns if you should reduce seats.

## Safety

- No real mainnet launches from tests (HTTP is mocked).
- Never put `BAGS_API_KEY` or wallet secrets in tool arguments.
