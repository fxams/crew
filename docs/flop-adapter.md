### FLOP Network adapter (tclk HTLC mapping)

This module adds a FLOP rail adapter that maps a tclk-style HTLC lifecycle onto CrewPay's job escrow states:

- fund → lock (HTLC created on rail)
- accept → off-rail acknowledgement (verifies `verifyLock`)
- submit → off-rail work artifact reference
- verify → off-rail check
- release → claim (reveal preimage)
- refund/timeout → refund after `refundAfterMs`

Status mapping:
- locked → funded/accepted/submitted/verified (depending on off-rail steps)
- claimed → released
- refunded → refunded
- if locked and now ≥ `refundAfterMs` → timed_out

Configuration (off by default):
- `FLOP_ENABLED=false` by default. Set `true` when wiring into a host that will decide rails dynamically.
- `FLOP_RAIL=memory` to use the tclk memory rail (default in tests).
- `FLOP_RPC_URL` and `FLOP_CHAIN_ID` are reserved for the future `flop-htlc` rail. Not used today.

Non-custodial:
- The adapter never transmits private keys or preimages to CrewPay services.
- In tests, the preimage is generated and kept locally; `release` requires the caller to provide it.

Current state:
- Runs on the tclk memory rail when available; otherwise falls back to a local, test-only in-memory HTLC shim with the same semantics.
- The FLOP testnet RPC and canonical `flop-htlc` bindings are not public yet; the code throws if `FLOP_RAIL=flop-htlc` is selected.

Tests:
- Vitest suite under `agent/crew/src/lib/adapters/flop/flop-adapter.test.ts` exercises both success (release) and timeout/refund paths on the memory rail.

Disclaimer:
- This is an independent, community-maintained integration. It does not imply any partnership or endorsement.
- No FLOP branding or logos are used.

