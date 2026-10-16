# CrewPay Sui launchpad (testnet)

CrewPay’s **own** bonding-curve launchpad on **Sui testnet** (`contracts/sui-launchpad`). Trade fees split **on-chain** to crew (60%), launching agent (15%), treasury (25%), or 60/15/5/20 when a referrer address is set. The API builds **unsigned** transactions only; the launcher signs locally.

## Enablement

| Variable | Purpose |
| --- | --- |
| `SUI_ENABLED` | `1` / `true` to allow `platform: "sui"` |
| `SUI_LAUNCHPAD` | `crewpay` (use this rail). Default `memez` keeps Memez.gg — see [sui-memez.md](./sui-memez.md). |
| `SUI_NETWORK` | `testnet` only (default). `mainnet` is rejected. |
| `SUI_RPC_URL` | Optional RPC (default testnet full node) |
| `SUI_TREASURY_ADDRESS` | 0x… treasury in CrewPay’s shareholder map |
| `CREWPAY_LAUNCHPAD_PACKAGE_ID` | Published `crewpay_launchpad` package id |
| `CREWPAY_LAUNCHPAD_CONFIG_ID` | Shared `LaunchpadConfig` object id from deploy |
| `CREWPAY_LAUNCHPAD_MEME_COIN_TYPE` | Optional fallback type for step 2 if `publishedPackageId` omitted |

## Two-step launch

1. **`sui_launchpad_publish_coin`** — publish embedded `crewpay_meme_coin` module; read `TreasuryCap` and **package id** from effects.
2. **`sui_launchpad_open_pool`** — `pool::create_pool_with_recipients` with crew vectors, agent, treasury, optional referrer.

Rebuild `POST /api/agent/launch/unsigned` with `treasuryCapObjectId` and `publishedPackageId` after step 1. Submit via `POST /api/agent/launch/submit` with `platform: "sui"`.

## Move package overview

| Module | Role |
| --- | --- |
| `curve` | Constant-product quotes with virtual SUI/meme reserves |
| `fees` | Weighted crew split inside 60%; agent 15%; referrer 5% when set; treasury gets 25% (or 20%) **plus rounding dust** |
| `pool` | `buy` / `sell` with `min_out` slippage; trade fee from `LaunchpadConfig`; graduation when real SUI ≥ `target_sui` |
| `config` | Admin cap: `trade_fee_bps` (capped), pause **new launches only** — no withdrawal of user/curve funds |
| `migration` | Stub: `CetusMigrationPending` event + TODO for Cetus testnet LP migrate/burn |

Post-graduation creator fee sharing on a live DEX is **not** implemented; treasury/agent/crew splits apply on curve trades only until graduation.

## Deploy (testnet)

From `contracts/sui-launchpad`:

```bash
chmod +x scripts/deploy-testnet.sh
./scripts/deploy-testnet.sh
```

Requires `sui client` on testnet with gas. **Do not** deploy to mainnet with this script.

After publish, set `CREWPAY_LAUNCHPAD_PACKAGE_ID` and `CREWPAY_LAUNCHPAD_CONFIG_ID` on the API.

## Tests

```bash
cd contracts/sui-launchpad && sui move test
```

Covers fee split correctness, rounding dust to treasury, pool buy path, and math helpers.

## Pre-mainnet audit checklist

- [ ] **Access control** — `AdminCap` cannot move pool SUI/meme balances or user coins; only fee bps and launch pause.
- [ ] **Fee math** — `mul_div_floor` / treasury remainder; max `trade_fee_bps`; splits 60/15/25 and 60/15/5/20 under fuzzed amounts.
- [ ] **Slippage** — `min_out` enforced on buy/sell; revert on graduation / zero amounts.
- [ ] **Graduation** — threshold edge cases; no double-graduate; stub migration does not claim Cetus integration is complete.
- [ ] **TreasuryCap** — stored in pool; no mint entrypoints after pool creation.
- [ ] **Crew weights** — sum to 10_000 bps within crew slice; empty crew vector rejected at pool open.
- [ ] **Upgrade policy** — package immutability vs expected upgrade path documented.
- [ ] **Backend** — env ids match deployed package; coin type derived from publish package id matches on-chain type.
- [ ] **Economic** — virtual liquidity parameters, target SUI, and supply defaults reviewed for manipulation / sandwich risk.
- [ ] **Integration** — Cetus (or successor) migration module completed, LP burn/lock verified on testnet before mainnet.

## Open risks (testnet)

- Cetus migration is a **stub**; graduated pools do not yet seed a real DEX pool.
- Step 1 reuses the same embedded meme-coin publish module as Memez rail; coin metadata is generic until a future metadata pass.
- Bonding curve uses virtual reserves; large trades near graduation need client-side quotes and slippage.
