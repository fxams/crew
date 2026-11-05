# FLOP / tclk settlement rail

Independent community adapter. Not a partnership or endorsement. No branding.

Maps tclk HTLC lock / reveal / refund onto CrewPay's `SettlementRail` from the jobs + escrow system (`agent/crew-api/src/lib/jobs/settlement.ts`). Two backends:

- **memory** (default): `@flop-labs/tclk` `MemoryRail`. Process-local, no chain.
- **flop-htlc** (opt-in): community client for the public FLOP disposable **devnet** `hasStation` pallet.

## Mapping

| CrewPay job / rail step | tclk memory rail | flop-htlc (devnet) |
|---|---|---|
| `fund` | `MemoryRail.lock` | `hasStation.openEscrow` with policy `And[Hash(h)]` |
| `lock` / `verifyFunding` | `MemoryRail.verifyLock` | `query.hasStation.escrows` (`Open`) |
| accept / submit / verify | Off-rail (jobs store + HTTP routes) | same |
| `release` | unsigned `tclk:reveal` | unsigned `hasStation.satisfyEscrow` |
| `reveal` (local / tests) | `MemoryRail.claim` | `hasStation.satisfyEscrow` (needs `FLOP_SIGNING_URI`) |
| `refund` / timeout | `MemoryRail.refund` after `refundAfterMs` | `hasStation.refundEscrow` after the deadline block |

Job HTTP states stay `created → funded → assigned → submitted → verified → paid | refunded`.

## Flags (all off by default)

Jobs endpoints remain behind `JOBS_ENABLED`. The FLOP rail is not the default. Unset the live flags to stay on the memory rail — no behavior change.

| Env | Default | Role |
|---|---|---|
| `FLOP_ENABLED` | unset / false | When true, `chainId=flop-testnet` or `flop-devnet` (or `FLOP_CHAIN_ID`) selects this rail |
| `JOBS_RAIL` / `POST /fund` `rail` | — | Set `flop-tclk` (or `flop`, `tclk-memory`) to opt in explicitly |
| `FLOP_RAIL` | `memory` | `memory` uses the tclk memory rail. `flop-htlc` selects the community has-station client |
| `FLOP_RPC_URL` | unset | Public HTTPS or WSS RPC. Required for `flop-htlc`. JSON-RPC reads use HTTPS; signed submit rewrites `https://` → `wss://` because HttpProvider cannot watch in-block status |
| `FLOP_CHAIN_ID` | `flop-testnet` | Must be `flop-devnet` for the live client |
| `FLOP_SIGNING_URI` | unset | Optional sr25519 URI used only in-process to sign extrinsics. Never sent to the API, never generated, never logged, never committed |
| `FLOP_EXPECTED_GENESIS_HASH` | pinned flop-devnet hash | If set, must equal the pin or the client refuses to start |

Selecting `FLOP_RAIL=flop-htlc` with any chain id other than `flop-devnet` throws. A genesis mismatch (reset or wrong network) throws.

## Enable the community flop-htlc client (devnet only)

Devnet earns nothing, has no rewards, and may reset. Test FLOP has no value.

1. Point at the public disposable network:

   ```bash
   export FLOP_RAIL=flop-htlc
   export FLOP_CHAIN_ID=flop-devnet
   export FLOP_RPC_URL=https://rpc.devnet.flop.network
   ```

2. Create a **throwaway** SS58 address (prefix 42) in a wallet that speaks Substrate, or use the faucet "Generate a test address" control. Keep that key off this repo and out of logs.

3. Fund it from [faucet.flop.network](https://faucet.flop.network): paste the address and request the quick grant (25 FLOP). The faucet also accepts `POST /fund` with `{ "address": "<ss58>" }`. Do not send a signing URI to the faucet.

4. Fund **both** the signer and the payee. `satisfyEscrow` credits the payee. A payee that has never received funds is a Substrate dead account (`balances.DeadAccount`). The client **fails early** with `PAYEE_DEAD_ACCOUNT` and does **not** auto-transfer the existential deposit (that would spend the signer's balance without an explicit request). Request a faucet grant for the payee first, then retry claim.

5. Optional, only if this process should submit signed extrinsics:

   ```bash
   export FLOP_SIGNING_URI='<throwaway sr25519 URI>'
   ```

   Without that variable the rail returns unsigned `hasStation.openEscrow` / `satisfyEscrow` / `refundEscrow` payloads. HTTP routes still reject `privateKey`, `preimage`, `mnemonic`, and similar fields.

6. Amounts on this rail are raw Planck (`1 FLOP = 10^18`). `deadlineBlocks` is a relative block count (devnet authors ~1s blocks).

### Signed submit (wss, bounded timeout)

JSON-RPC identity and storage reads stay on HTTPS. `signAndSend` needs a websocket subscription. An `https://` `FLOP_RPC_URL` is rewritten to `wss://` for the Polkadot provider. Submit watches in-block status with a 60s timeout (`SUBMIT_TIMEOUT`). If the RPC returns no status (the previous HTTPS hang: `Cannot read properties of undefined (reading 'isInBlock')`), the client fails immediately with `SUBMIT_FAILED` instead of waiting.

`openEscrow` must emit `EscrowOpened`. If the extrinsic fails or no `escrowId` is parsed, lock throws `ESCROW_ID_MISSING` rather than returning an empty id.

### Identity pin

The client pins genesis `0x99c172c095340ace980631f9123544c6bebd4839f3437e463533422d8be2d631` (read from `chain_getBlockHash(0)` and independently from faucet `/chain` on 2026-11-03 UTC). A reset or a different RPC fails closed.

Read-only smoke (no key, no funds):

```bash
cd agent/crew-api
npm run flop:devnet-smoke
```

## Non-custodial

The API never accepts private keys, seeds, or hash-lock preimages. `release` returns an unsigned satisfy payload. Tests keep a preimage in-process only when `retainPreimageForTests` is set on the rail constructor — that helper is not an HTTP surface.

## On-chain surface (verified against the live RPC)

Pallet `hasStation` (`pallet_has_station`):

| Job step | Extrinsic | Args (metadata) |
|---|---|---|
| lock | `openEscrow` | `payee: AccountId32`, `amount: u128`, `policy: Policy`, `deadlineBlocks: u32` |
| claim | `satisfyEscrow` | `escrowId: H256`, `preimages: Vec<Bytes>` (hex strings, not raw `Uint8Array`) |
| refund | `refundEscrow` | `escrowId: H256` |

Status:

- Job escrow: `query.hasStation.escrows` → `{ id, funder, payee, amount, policy, deadline, status: Open\|Released\|Refunded, createdBlock }`
- Inference HTLC (not used for CrewPay jobs): `hasStation_checkHTLCStatus` (`H256` hash lock). Missing → RPC `32004 HTLC not found`. Invalid encoding → `32002`.

`hasStation_getHtlcByHashLock` is advertised by `rpc_methods` but this node rejects a single `hash_lock` argument (`-32602 Invalid params`). The client uses `checkHTLCStatus` plus `htlcsByHashLock` storage.

Policy for job escrow is the runtime's documented HTLC shape: `And[Hash(h)]`. Deadline is a separate relative block count; after it the funder may `refundEscrow`.

## Files

- `agent/crew-api/src/lib/jobs/flop-rail.ts` — `FlopTclkSettlementRail` implements `SettlementRail`
- `agent/crew-api/src/lib/jobs/flop-htlc-client.ts` — lock / claim / refund orchestration
- `agent/crew-api/src/lib/jobs/flop-htlc-rpc.ts` — JSON-RPC identity + HTLC status
- `agent/crew-api/src/lib/jobs/flop-htlc-polkadot.ts` — metadata-driven submit (optional signer; https → wss)
- `agent/crew-api/src/lib/jobs/flop-htlc-submit.ts` — URL rewrite, in-block timeout, payee ED check, escrow-id require
- `agent/crew-api/src/lib/jobs/flop-config.ts` — flags + secret rejection
- `agent/crew-api/src/lib/jobs/settlement.ts` — `railFor(...)` wiring
- `agent/crew-api/src/lib/jobs/flop-rail.test.ts` — memory-rail tests
- `agent/crew-api/src/lib/jobs/flop-htlc-*.test.ts` — mocked RPC / client tests
- `agent/crew-api/scripts/flop-devnet-smoke.ts` — read-only live identity check
- `docs/flop-agents.md` — outside-agent jobs + escrow walkthrough (unsigned, flop-devnet)
- `integrations/flop-tclk/` — existing paper-rail demo / harness (unchanged choreography)

## What is not included

- No funded live lock / claim / refund in CI (that needs a throwaway key and faucet FLOP). A funded lock / claim / refund cycle over `wss://rpc.devnet.flop.network` succeeded 2026-11-05 UTC outside CI. HTTPS submit without the wss rewrite hung; that path is now rewritten and bounded.
- Inference `createHtlc` / `redeemHtlc` (TEE appraisal) is a different pallet path and is not used for CrewPay jobs.
- Agent DID registry (`agentIdentity`) is on the same runtime and is not wired here.
- Mainnet / testnet are refused. This is a disposable-devnet community adapter only.
