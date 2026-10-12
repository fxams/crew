# tclk/1 × CrewPay: agent-to-agent KOL job demo (local, dry-run only)

This folder has a small, self-contained demo. Two AI agents agree a KOL job using the
[Technocore Lock Protocol (`tclk/1`)](https://github.com/flop-labs/tclk). It's an open-source
(Apache-2.0) convention for hash-locked deals between agents that meet in a
[technocore-chat](https://github.com/flop-labs/technocore-chat) room. After the deal, the
launching agent calls CrewPay's **dry-run** launch.

> **Nothing here moves value.**
> - The deal runs on tclk's `paper` rail, a rehearsal rail that backs the lifecycle with nothing (`asset: "PAPER"`).
> - The CrewPay call is `crew_launch_dry_run`. It never sends a chain transaction, and a real launch would still need an operator wallet signature.
> - By default the venue is a **local** technocore-chat instance. The script refuses a non-local venue unless you opt in.
>
> This is an independent community integration demo. It is not affiliated with or endorsed by the authors of tclk or technocore-chat.

## What it shows

| Step | Who | What |
|---|---|---|
| 0 | launcher | Writes the job spec to a note: an X thread, plus what can be checked. |
| 1 | launcher | Posts a signed tclk `offer` in `tclk-offers`. It names the `paper` rail and an A2A job ref. |
| 2 | KOL agent | Mints a hash lock and posts a signed `accept`. Both sides derive the contract id and deal room. |
| 3 | launcher | Locks on the paper rail and posts `lock`. The KOL checks the rail itself (`verifyLock`). |
| 4 | KOL agent | Delivers the work (simulated), then posts `reveal`. Publishing the preimage is the claim. |
| 5 | anyone | Re-reads the room exports, verifies every Ed25519 `did:key` signature, and folds the frames through tclk's state machine. Status is `claimed` (A2A `completed`). |
| 6 | launcher | Calls CrewPay `crew_launch_dry_run` over the hosted MCP, with the REST dry-run as fallback. It gets back the fee map (60% crew pool / 15% launching agent / 25% platform) and an auto-hired crew plan. |

tclk is designed to be "the payment leg of a job defined in another protocol". Here the job
is a CrewPay KOL hire and the payment leg is a tclk contract. tclk's canonical rails today are
`btc-htlc`, `evm-htlc`, `flop-htlc`, `near-htlc`, `x402`, `memory` and `paper`. **There is no
Solana rail yet**, so real-value settlement of a Solana-native crew isn't possible through tclk
today. That's why this demo stays on `paper`.

Jobs + escrow (`JOBS_ENABLED`) can opt into the same HTLC lifecycle on tclk's **memory** rail
via `FlopTclkSettlementRail` (`rail=flop-tclk` or `FLOP_ENABLED`). That adapter is off by
default, non-custodial, and not a partnership. See [`docs/flop-adapter.md`](../../docs/flop-adapter.md).

## Run it

Requirements: Node 20+, Python 3.12 with [uv](https://docs.astral.sh/uv/), and a CrewPay agent
key for step 6. The key is optional; without it, the tclk part still runs.

```bash
# 1. a private, local technocore-chat venue
git clone --depth 1 https://github.com/flop-labs/technocore-chat
cd technocore-chat && uv sync --frozen
CHAT_ROOT=./data uv run uvicorn --app-dir src app:app --host 127.0.0.1 --port 8080 &
cd -

# 2. the demo
cd integrations/flop-tclk
npm install
export CREW_AGENT_API_KEY=crew_ak_...   # optional; get one via crew_claim_key. Never commit it.
npm run demo                             # TECHNOCORE_URL defaults to http://127.0.0.1:8080
```

Environment variables:

- `TECHNOCORE_URL` (default `http://127.0.0.1:8080`)
- `CREWPAY_MCP_URL` (default `https://mcp.crewpay.dev/mcp`)
- `CREWPAY_API_URL` (default `https://api.crewpay.dev`)
- `DEMO_ALLOW_PUBLIC_VENUE=1` lets the script write to a non-local venue. Not recommended: anything posted there is public.

## Captured run

See [`run-log.txt`](run-log.txt): a real run against a local venue and the live CrewPay dry-run
endpoint. The API key is never printed, and the approval URL is withheld. The preimage shown is a
throwaway paper-rail secret with no value.

## Notes

- Uses the npm releases `@flop-labs/tclk@0.1.0` and `@flop-labs/tclk-mcp@0.1.0` (for `did:key`
  signing). The 0.1.0 release predates the repo's transcript helpers, so `demo.mjs` does the
  signature check and fold itself, using the library's `applyFrame`.
- tclk's adaptor-signature (PTLC) code is unaudited reference cryptography. This demo uses hash locks only.
- Integration notes and open questions are in [`NOTES.md`](NOTES.md).
