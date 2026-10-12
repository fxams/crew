# FLOP / tclk settlement rail

Independent community adapter. Not a partnership or endorsement. No branding.

Maps tclk HTLC lock / reveal / refund onto CrewPay's `SettlementRail` from the jobs + escrow system (`agent/crew-api/src/lib/jobs/settlement.ts`).

## Mapping

| CrewPay job / rail step | tclk memory rail |
|---|---|
| `fund` | `MemoryRail.lock` (hash lock created) |
| `lock` / `verifyFunding` | `MemoryRail.verifyLock` |
| accept / submit / verify | Off-rail (jobs store + HTTP routes) |
| `release` | unsigned `tclk:reveal` — client holds the preimage |
| `reveal` (local / tests) | `MemoryRail.claim` |
| `refund` / timeout | `MemoryRail.refund` after `refundAfterMs` |

Job HTTP states stay `created → funded → assigned → submitted → verified → paid | refunded`.

## Flags (all off by default)

Jobs endpoints remain behind `JOBS_ENABLED`. The FLOP rail is not the default.

| Env | Default | Role |
|---|---|---|
| `FLOP_ENABLED` | unset / false | When true, `chainId=flop-testnet` (or `FLOP_CHAIN_ID`) selects this rail |
| `JOBS_RAIL` / `POST /fund` `rail` | — | Set `flop-tclk` (or `flop`, `tclk-memory`) to opt in explicitly |
| `FLOP_RAIL` | `memory` | `memory` uses `@flop-labs/tclk` `MemoryRail`. `flop-htlc` is reserved |
| `FLOP_RPC_URL` | unset | When set (with `FLOP_RAIL=flop-htlc`), points at the future testnet RPC |
| `FLOP_CHAIN_ID` | `flop-testnet` | Logical / future public chain id |

Selecting `flop-htlc` or setting `FLOP_RPC_URL` without a published binding throws. Unset those to stay on the memory rail.

## Non-custodial

The API never accepts private keys, seeds, or hash-lock preimages. `release` returns an unsigned reveal payload. Tests keep a preimage in-process only when `retainPreimageForTests` is set on the rail constructor — that helper is not an HTTP surface.

## Files

- `agent/crew-api/src/lib/jobs/flop-rail.ts` — `FlopTclkSettlementRail` implements `SettlementRail`
- `agent/crew-api/src/lib/jobs/flop-config.ts` — flags + secret rejection
- `agent/crew-api/src/lib/jobs/settlement.ts` — `railFor(...)` wiring
- `agent/crew-api/src/lib/jobs/flop-rail.test.ts` — memory-rail tests
- `integrations/flop-tclk/` — existing paper-rail demo / harness (unchanged choreography)

## When the FLOP testnet RPC is public

1. Set `FLOP_RPC_URL` and `FLOP_CHAIN_ID` to the published values.
2. Implement the `flop-htlc` client behind `FLOP_RAIL=flop-htlc` (unsigned lock / claim / refund).
3. Add a gated integration test that talks to the live RPC (not the default CI path).
4. Keep memory-rail tests as the hermetic suite.
