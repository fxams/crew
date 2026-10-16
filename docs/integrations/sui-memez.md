# Sui Memez.gg / Blast.fun launch rail (testnet)

CrewPay builds **unsigned** Memez pump launches on **Sui testnet** via `@interest-protocol/memez-fun-sdk`. The agent signs locally; CrewPay never holds the launcher key.

## Enablement

| Variable | Purpose |
| --- | --- |
| `SUI_ENABLED` | `1` / `true` to show `sui` on `GET /api/platforms` and allow launches |
| `SUI_NETWORK` | `testnet` only (default). `mainnet` is rejected. |
| `SUI_RPC_URL` | Optional RPC (default `https://fullnode.testnet.sui.io:443`) |
| `SUI_TREASURY_ADDRESS` | 0x… Sui treasury in the CrewPay fee map |
| `MEMEZ_CONFIG_KEY` | Interest Protocol integrator `ConfigKey` (empty → Blast.fun XPUMP testnet default) |

API: `POST /api/agent/launch/unsigned` with `platform: "sui"`. MCP: `crew_build_unsigned` with the same `platform`.

## Two-step launch

1. **`sui_memez_publish_coin`** — publish a fresh coin package; yields a `TreasuryCap` (supply 0) in transaction effects.
2. **`sui_memez_create_pool`** — `MemezPumpSDK.newPool` with that treasury cap, SUI quote, and Memez metadata.

Rebuild unsigned with `treasuryCapObjectId` (or `mintPubkey`) after step 1 to receive step 2. Submit signed base64 transactions via `POST /api/agent/launch/submit` with `platform: "sui"`.

## Fee map vs on-chain

**CrewPay planning:** 60% KOL crew / 15% launching agent / 25% treasury (or 60/15/5/20 with referrer).

**On-chain:** Enforced only when Interest Protocol registers a **custom** `MEMEZ_CONFIG_KEY` whose `MemezFees` and `dynamic_stake_holders` match how CrewPay passes `stakeHolders` at pool creation. Until then, the API uses the Blast.fun **XPUMP** testnet config and returns an explicit warning that the CrewPay split is **not** enforced on-chain.

## Interest Protocol registration (request checklist)

Ask Interest Protocol to register a CrewPay integrator config on **Sui testnet** with:

| Parameter | CrewPay ask |
| --- | --- |
| `configurationKey` | Stable type string returned as `MEMEZ_CONFIG_KEY` (e.g. `0x…::crewpay::ConfigKey`) |
| `quote_coin` | `0x2::sui::SUI` |
| `dynamic_stake_holders` | Count of Sui addresses CrewPay passes at `newPool` (crew recipients + agent desk + treasury [+ referrer when 60/15/5/20]) |
| `creation` fee | Nominal SUI + recipient bps (if any) |
| `meme_swap` / `quote_swap` | Swap fee bps + recipients aligned with 60/15/25 (or 60/15/5/20) across protocol-required slots |
| `migration` | Migration fee bps + recipients (treasury / crew / agent as applicable) |
| `allocation` | Stakeholder allocation bps + vesting periods for post-migration crew distribution |
| `get_pump` defaults | `burn_tax`, `virtual_liquidity`, `target_quote_liquidity`, `liquidity_provision` for testnet pump pools |
| Migrator witness | Allow `TEST` migrator witness on testnet (or specify XPUMP migrator when available) |
| Protected pools | Default `isProtected: false` unless CrewPay later sets a backend public key |

## Rebuild coin bytecode

Source: `agent/crew-api/move/crewpay_meme_coin`. After `sui move build`, refresh `CREWPAY_MEME_COIN_MODULE_BASE64` in `sui-memez-coin-bytecode.ts`.
