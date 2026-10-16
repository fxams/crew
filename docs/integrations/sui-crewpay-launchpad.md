# CrewPay Sui launchpad (testnet)

CrewPay’s **own** bonding-curve launchpad on **Sui testnet** (`contracts/sui-launchpad`). Trade fees split **on-chain** to crew (60%), launching agent (15%), treasury (25%), or 60/15/5/20 when a referrer address is set. The API builds **unsigned** transactions only; the launcher signs locally.

## Enablement (Render / crew-api)

| Variable | Purpose |
| --- | --- |
| `SUI_ENABLED` | `1` / `true` to allow `platform: "sui"` |
| `SUI_LAUNCHPAD` | `crewpay` (use this rail). Default `memez` keeps Memez.gg — see [sui-memez.md](./sui-memez.md). |
| `SUI_NETWORK` | `testnet` only (default). `mainnet` is rejected. |
| `SUI_RPC_URL` | Optional RPC (default testnet full node) |
| `SUI_TREASURY_ADDRESS` | 0x… treasury in CrewPay’s shareholder map |
| `CREWPAY_LAUNCHPAD_PACKAGE_ID` | Published `crewpay_launchpad` package id (original publish id; upgrades keep this id) |
| `CREWPAY_LAUNCHPAD_CONFIG_ID` | Shared `LaunchpadConfig` object id from deploy |
| `CREWPAY_LAUNCHPAD_MIGRATION_CONFIG_ID` | Shared `CetusMigrationConfig` (tick spacing for CLMM migration) |

Example testnet deploy (see `contracts/sui-launchpad/scripts/e2e-testnet-results.json`):

- `CREWPAY_LAUNCHPAD_PACKAGE_ID=0x37cf5eccf86586fb10866c4a703e2098e2462aa437cb48100c04ba5ca57e3f64`
- `CREWPAY_LAUNCHPAD_CONFIG_ID=0x3360244e91cdfbd66c4e7086b1f8e57659c923eb610637f0541733246282895a`
- `CREWPAY_LAUNCHPAD_MIGRATION_CONFIG_ID=0xb34df4d72ce61698ac17d81804c9af4a8d5a36c623775dc31b59209f3464b3cd`

## Launch flow

1. **`sui_launchpad_publish_coin`** — publish embedded `crewpay_meme_coin` module; read `TreasuryCap` and **package id** from effects.
2. **`sui_launchpad_open_pool`** — `pool::create_pool_with_recipients` with crew vectors, agent, treasury, optional referrer.
3. **Trading** — `pool::buy` / `pool::sell` until real SUI in the pool ≥ `target_sui` (`graduated = true`).
4. **Cetus migration** — after graduation, prefer the **live PTB path** (`begin_cetus_ptb_migration` → Cetus SDK `pool_creator::create_pool_v2` on published-at **`0x85e612…`** → `finish_cetus_ptb_migration`). See `scripts/migrate-live-ptb-testnet.sh`. Legacy **`pool::migrate_to_cetus`** still targets the first-publish Cetus package (`0x6bbd…`) and aborts on testnet.

Rebuild `POST /api/agent/launch/unsigned` with `treasuryCapObjectId` and `publishedPackageId` after step 1. Submit via `POST /api/agent/launch/submit` with `platform: "sui"`.

## Cetus CLMM (testnet)

| Item | Value |
| --- | --- |
| Move dependency | [CetusProtocol/cetus-contracts](https://github.com/CetusProtocol/cetus-contracts) rev **`0a90d59…`** (testnet package origin **`0x5372…`**) |
| SDK reference | `@cetusprotocol/cetus-sui-clmm-sdk` testnet `clmm_pool.published_at` **`0x85e612…`** + `GlobalConfig` **`0x9774…`** / `Pools` **`0x50eb…`** |
| Legacy pitfall | First launchpad publish linked **`0x6bbd…`** Cetus; `migrate_to_cetus` still calls that factory (`new_pool_key` abort 6). Use **`begin_cetus_ptb_migration` / `finish_cetus_ptb_migration`** + SDK **`create_pool_v2`** (`fix_amount_a = false`, full-range ticks from `full_range_tick_range(60)`). Script: `scripts/migrate-live-ptb-testnet.sh`. |
| On-chain package (GlobalConfig type) | `0x5372d555ac734e272659136c2a0cd3227f9b92de67c80dc11250307268af2db8` |
| `GlobalConfig` shared object | `0xc6273f844b4bc258952c4e477697aa12c918c8e08106fac6b934811298c9820a` |
| `Pools` shared object | `0x20a086e6fa0741b3ca77d033a65faf0871349b986ddbdde6fa1d85d78a5f4222` |
| `Clock` | `0x6` |

Newer Cetus testnet package revisions exist (`0x6bbdf09f…` per Cetus docs); our Move build pins **`testnet-v0.0.2`** sources. Before mainnet, re-pin to the Cetus revision that matches the live `GlobalConfig` / `Pools` objects you target.

`migrate_to_cetus` accepts `CoinMetadata<T>` and `CoinMetadata<SUI>` for ABI compatibility with the first publish; Cetus `create_pool_v3` does not use them. Clients must pass the correct metadata objects (resolve via gRPC/GraphQL or indexer — public JSON-RPC `suix_getCoinMetadata` is deprecated on many fullnodes).

## Move package overview

| Module | Role |
| --- | --- |
| `curve` | Constant-product quotes with virtual SUI/meme reserves |
| `fees` | Weighted crew split inside 60%; agent 15%; referrer 5% when set; treasury gets 25% (or 20%) **plus rounding dust** |
| `pool` | `buy` / `sell` with `min_out`; graduation flag; `migrate_to_cetus` |
| `config` | Admin cap: fee bps + pause new launches only |
| `migration_config` | Shared tick spacing for CLMM migration |
| `migration` / `migration_math` | Cetus `create_pool_v3` + `LockedClmmPosition` |
| `migration` | LP locked in-package (not transferable/burned on-chain, but no remove-liquidity API exposed) |

Post-graduation creator fee sharing on Cetus swap fees is **not** wired; only curve trade fees use the CrewPay split.

## Deploy / upgrade (testnet)

```bash
cd contracts/sui-launchpad
sui move build
sui client publish --gas-budget 500000000   # first time
# or
sui client upgrade --upgrade-capability <Admin UpgradeCap> --gas-budget 500000000
```

See `scripts/deploy-testnet.sh`. Record ids from publish effects (`LaunchpadConfig`, `CetusMigrationConfig`).

## Tests

```bash
cd contracts/sui-launchpad && sui move test
```

**21** unit tests (fees, curve edges, pool slippage/graduation/reserve, migration math + Cetus coin order).

## Testnet e2e (manual)

`contracts/sui-launchpad/scripts/e2e-testnet-results.json` lists Suiscan links for publish → open pool → buys → graduation. Migration PTB requires resolving `CoinMetadata<0x2::sui::SUI>` object id on testnet.

## Pre-mainnet audit checklist

- [ ] **Access control** — `AdminCap` cannot move pool SUI/meme balances or user coins; only fee bps and launch pause.
- [ ] **Fee math** — `mul_div_floor` / treasury remainder; max `trade_fee_bps`; splits 60/15/25 and 60/15/5/20 under fuzzed amounts.
- [ ] **Slippage** — `min_out` enforced on buy/sell; revert when graduated.
- [ ] **Graduation** — threshold edge cases; `migrated` set only after successful Cetus path.
- [ ] **Cetus alignment** — dependency tag matches live `GlobalConfig` / `Pools`; sqrt price inside Cetus bounds.
- [ ] **LP lock** — `LockedClmmPosition` has no user-facing remove-liquidity; confirm Cetus position cannot be recovered via other entrypoints.
- [ ] **TreasuryCap** — stored in pool; no extra mint APIs.
- [ ] **Crew weights** — sum to 10_000 bps within crew slice.
- [ ] **Upgrade policy** — compatible upgrades preserve `migrate_to_cetus` signature.
- [ ] **Backend** — env ids match deployed package; metadata resolution for migration PTBs.

## Open risks (testnet)

- Cetus package revision on-chain (`0x5372…`) vs git pin (`testnet-v0.0.2`) must be validated under audit.
- Migration PTB needs live `CoinMetadata<SUI>` object id (indexer/gRPC); default public RPC may not expose `suix_getCoinMetadata`.
- Virtual curve quotes can exceed inventory; `buy` caps meme out to tradable inventory (supply minus **20%** migration LP reserve).
- Graduation requires real SUI ≥ `target_sui` and meme balance ≥ migration reserve.
- Leftover Cetus `create_pool_v3` dust refunds to the pool treasury address (see `migrate_to_cetus`).
