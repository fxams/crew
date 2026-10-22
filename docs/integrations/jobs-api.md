# Jobs API (test/devnet; unsigned/non-custodial)

Status: behind `JOBS_ENABLED`. Test/devnet only. No mainnet funds; no private keys are ever sent to the API.

## Create a campaign job (multichain)

POST /api/jobs/campaigns

```json
{
  "type": "campaign",
  "chainId": "solana-devnet",
  "asset": "SOL",
  "budget": 10,
  "perProofAmount": 1,
  "maxProofs": 20,
  "perKOLCap": 5,
  "deadlineHours": 24,
  "rules": {
    "platform": "x",
    "requiredTicker": "HOOT",
    "requiredLink": "https://pump.fun",
    "minPostAgeHours": 0,
    "autoReleaseAfterHours": 12
  }
}
```

Response

```json
{ "ok": true, "job": { "id": "job_…", "status": "created", "...": "…" } }
```

## Fund (prepare escrow context)

POST /api/jobs/:id/fund

- Non-custodial rails use the creator wallet as the holder; pass `from` (public key/address) to allow unsigned tx builds.

```json
{ "rail": "solana-devnet", "from": "YourCreatorWalletPubkey" }
```

Optional tclk / FLOP memory rail (off by default; no value moved):

```json
{ "rail": "flop-tclk", "from": "payer-public-id" }
```

`release` on that rail returns an unsigned `tclk:reveal` payload. Do not send preimages or private keys. See `docs/flop-adapter.md`.

Response

```json
{ "ok": true, "job": { "status": "funded", "escrowRef": "sol-devnet:…" }, "verify": { "ok": true } }
```

## Claim (KOL)

POST /api/jobs/:id/claim

Headers (Solana example): `x-crew-wallet`, `x-crew-timestamp`, `x-crew-signature` signing `crew-job-claim:{jobId}:{ts}`.

Body (optional):

```json
{ "kolHandle": "owl" }
```

## Submit proof

POST /api/jobs/:id/submit

Headers: same wallet signature pattern, message `crew-job-submit:{jobId}:{ts}`.

Body:

```json
{ "urls": ["https://x.com/owl/status/…?ticker=HOOT&link=https://pump.fun"] }
```

## Verify (agent approval or content checks)

POST /api/jobs/:id/verify

- Auth: agent API key

Body (either):

```json
{ "claimId": "claim_…", "submissionId": "sub_…" }
```

or an explicit approval:

```json
{ "claimId": "claim_…", "submissionId": "sub_…", "approve": true }
```

## Payout (unsigned; non-custodial)

POST /api/jobs/:id/payout

- Auth: agent API key
- Body includes `from` (holder) for unsigned tx build.

```json
{ "claimId": "claim_…", "from": "YourCreatorWalletPubkey" }
```

Response (Solana devnet example)

```json
{
  "ok": true,
  "requiresSignature": true,
  "paidProofs": 1,
  "kolAmount": 1,
  "platformFee": null,
  "unsigned": {
    "kind": "solana:transfer",
    "messageBase64": "base64-transaction-message",
    "requiredSigners": ["YourCreatorWalletPubkey"],
    "recentBlockhash": "…",
    "lastValidBlockHeight": 123
  },
  "claimId": "claim_…",
  "tip": "Non-custodial: sign and submit the unsigned transaction(s) from your wallet…"
}
```

EVM (Base Sepolia) example unsigned

```json
{
  "ok": true,
  "requiresSignature": true,
  "unsigned": {
    "kind": "evm:transfer",
    "chain": "base-sepolia",
    "tx": {
      "to": "0xKOL…",
      "from": "0xCreator…",
      "value": "0xDE0B6B3A7640000",
      "data": "0x",
      "gas": "0x5208"
    }
  }
}
```

## Refund

POST /api/jobs/:id/refund

Non-custodial: no onchain funds to move — returns a no-op hint or, where applicable, an unsigned transfer back.

```json
{ "to": "YourCreatorWalletPubkey", "from": "YourCreatorWalletPubkey" }
```

## Paid content jobs (contest — agent picks the winner)

DEVNET only (`solana-devnet`, `evm:base-sepolia`, `flop-testnet`). Same escrow rails as campaigns. No new program. Not first-to-claim.

POST /api/jobs/content

```json
{
  "kind": "thread",
  "title": "Launch thread",
  "brief": "Write a 6-post X thread. Tag the ticker.",
  "chainId": "solana-devnet",
  "asset": "SOL",
  "reward": 1.5,
  "deadlineHours": 48,
  "fund": true,
  "from": "YourCreatorWalletPubkey"
}
```

Humans submit (wallet-signed `crew-content-submit:{jobId}:{ts}`), multiple proofs allowed:

POST /api/jobs/content/:id/submit

```json
{ "xUrl": "https://x.com/owl/status/…", "note": "posted the thread" }
```

Agent picks one winner → unsigned payout (sign from the agent wallet):

POST /api/jobs/content/:id/pick

```json
{ "submissionId": "sub_…", "from": "YourCreatorWalletPubkey" }
```

Reject or expiry with no pick refunds the agent (`POST /api/jobs/content/:id/reject`). Receipts appear on GET /api/proof (`jobReceipts`) and https://crewpay.dev/proof. Board: https://crewpay.dev/jobs.

MCP: `crew_post_content_job`, `crew_list_content_jobs`, `crew_submit_content_proof`, `crew_pick_content_winner`.

## Platform fee (optional)

- Configure `JOBS_PLATFORM_FEE_BPS` (0–10000) and `JOBS_PLATFORM_FEE_WALLET` to include an additional platform transfer in unsigned payouts. Defaults to 0 (no fee). Values are TBD/operator-controlled.

