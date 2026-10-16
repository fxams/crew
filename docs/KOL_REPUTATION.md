# KOL reputation, tiers, and delivery-gated crew payouts

CrewPay keeps the **on-chain launch fee map unchanged** (60% KOL crew / 15% launching agent / 25% treasury, or 60/15/5/20 with agent referral). Optional **delivery-gated payouts** and **reputation-weighted crew shares** are controlled by `CREW_DELIVERY_GATED_PAYOUTS` (default **off**).

## Feature flag

| Env | Default | Effect |
|-----|---------|--------|
| `CREW_DELIVERY_GATED_PAYOUTS` | off | When `1`/`true`: Autohire uses reputation-weighted crew %; launches provision promo delivery ledgers; crew accrual is releasable only after verified promo tasks. |
| `CREW_PROMO_POST_WINDOW_HOURS` | `72` | Promo post must be submitted within this window after launch. |
| `CREW_PROMO_STILL_LIVE_HOURS` | `6` | Re-check that the X URL is still reachable (mock-friendly; no live X API required in tests). |
| `CREW_PROMO_MIN_ENGAGEMENT` | `3` | Minimum engagement score when proof text includes `engagement:N`. |

## Reputation score and tiers

Stats are tracked per payout wallet (in-memory + updated when jobs/tasks complete or disputes open):

- `completedVerifiedJobs` — paid, verified task/job completions  
- `onTimeJobs` / `completedJobs` — on-time delivery rate  
- `disputesLost`, `disputesOpened`

**Score** (clamped 25–100):

```
score = 25
  + 8 × min(completedVerifiedJobs, 10)
  + 20 × onTimeRate
  − 12 × disputesLost
  − 2 × min(disputesOpened, 5)
```

**Tiers**

| Tier | Score |
|------|-------|
| Bronze | &lt; 50 |
| Silver | 50–74 |
| Gold | ≥ 75 |

## Crew share weighting (flag on)

When `CREW_DELIVERY_GATED_PAYOUTS` is enabled, Autohire assigns integer **crew pool shares** (summing to 100) proportional to each seat’s reputation score instead of equal splits:

```
weight_i = max(25, reputationScore(wallet_i))
share_i = floor(100 × weight_i / Σ weight) + remainder to highest scores
```

On-chain bps still come from `buildCrewShareholders` using those `crew[].share` percentages — only the **split among the 60% crew pool** changes, not agent/treasury/referrer bps.

## Anti-fake-engagement (Autohire ranking)

Before narrative scoring, each candidate gets a **quality assessment** (no X API required):

- Engagement-to-follower ratio (likes/posts vs followers, with fallbacks)  
- Account age (registered KOLs) vs follower count  
- Follower spike vs Pump directory rank  
- Suspicious-reply / bot heuristics  

Accounts with `excluded: true` are dropped from Autohire ordering; others receive an `autohirePenalty` subtracted from hire score.

## Delivery-gated payouts

When the flag is on, after a successful fee-share lock the API provisions:

1. One **promo task** per crew seat (`taskCategory: promo-delivery`) on **solana-devnet** with `autoChecks`: HTTPS URL, reachability, `xPost`, ticker + coin page link, post window, still-live check, minimum engagement.  
2. A **per-mint ledger** tracking accrual, verification, forfeiture, and releasable amounts.

**Flow**

1. Crew fees **accrue** per wallet (`POST` remits / ops observation → `accrueCrewPayout`).  
2. KOL submits promo proof → `POST /api/coins/:mint/crew-payouts/submit` (reuses `runTaskAutoChecks`).  
3. Verified seats become **releasable**; unverified seats forfeit accrual after the promo window and roll into the **verified crew pool**.  
4. `POST /api/coins/:mint/crew-payouts/release` runs sim/devnet escrow release where funded.

**Read ledger:** `GET /api/coins/:mint/crew-payouts`  
**Reputation:** `GET /api/kols/reputation/:wallet`  
**Desk UI:** tier on `/kol/:handle` and registered rows on `/kols`.

Non-custodial only: escrow uses existing jobs **sim/devnet** rails; no earnings promises.
