# Jobs + Escrow (multichain) — test/devnet only

Status: draft, dev/test only (behind `JOBS_ENABLED`). No mainnet funds, no real money moved.

## Goals

- General job + escrow system to let AI agents hire humans and pay onchain.
- First job type: Paid Campaigns — KOLs post proof-of-work (X posts) and are paid per verified post.
- Multichain design via a chain-agnostic Settlement Rail adapter.
- Strictly test/devnet or simulated settlement; no changes to existing launch fee-split logic.

Out of scope for this step: production custody, mainnet program audits, marketplace UX, and payouts beyond simulation/devnet.

## Lifecycle

- created → funded → claimed/assigned → submitted → verified → paid | refunded/expired
  - created: Agent creates a job (chain + asset, budget, per-proof payout, rules, deadlines).
  - funded: Agent funds escrow on a chosen rail (simulated in tests; Solana devnet stub).
  - claimed/assigned: A KOL claims a task seat (wallet identity per chain).
  - submitted: KOL submits proof URL(s) per rules.
  - verified: Pluggable verifier validates proof-of-work (X post exists, from registered handle, contains required ticker/link, still live after N hours).
  - paid: Release funds for verified proofs up to caps; leftover is refundable to the creating agent on deadline/close.
  - refunded/expired: Any unallocated funds are returned to the agent after deadline or explicit cancel/close.

## Data model (logical)

- Job
  - id, type: 'campaign'
  - createdBy: agentKeyId or agentApiKey fingerprint
  - chainId: e.g., 'solana-devnet', 'solana', 'evm:base-sepolia', 'evm:base', etc.
  - asset: 'SOL', 'USDC', 'ETH', etc. (chain-scoped)
  - budget: total amount (base units)
  - perProofAmount: amount per verified proof (base units)
  - maxProofs, perKOLCap, deadline
  - rules: requiredTicker, requiredLink, minPostAgeHours, platform: 'x'
  - status: created | funded | open | assigned | submitted | verified | paid | refunded | closed | expired
  - escrowRef: rail-specific escrow reference (e.g., devnet stub id/tx or PDA address when audited)
  - funding: planned vs. verified (amount, tx/signatures, verifier state)
- Claim
  - jobId, kolHandle, kolWallet[chain], claimedAt, status
- Submission
  - claimId, urls[], submittedAt, verification: { ok, reason, proof }, verifiedAt
- Payout
  - claimId, amount, releasedAt, txRefs[] (rail-specific)

Test/dev uses in-memory store by default; Postgres DDL sketched for future persistence (tables: jobs, job_claims, job_submissions, job_events).

## Settlement rails (chain-agnostic)

Adapter interface (test-only implementation first):

- fund(intent): Prepare/fund escrow (test: simulated ledger; Solana: devnet stub).
- lock(escrowRef): Lock/hold funds for the job duration (no-op in sim).
- release(escrowRef, to, amount): Pay a beneficiary (KOL) for verified work.
- refund(escrowRef, to): Return unspent funds to the creating agent.
- verifyFunding(escrowRef): Confirm escrow availability/sufficiency.

Notes:
- Solana first: devnet or simulated program stub; final mainnet requires an audited program PDA model.
- EVM stubs: Base/Ethereum placeholders; real release/refund need audited escrow contracts.
- TCLK rails: future alternative settlement leg (integrations/flop-tclk), mappable via the same interface.

## Proof-of-work verification (campaigns)

- Platform: X (Twitter) to start.
- Checks (pluggable, mock for tests):
  - Post URL exists; author handle matches registered KOL handle (or claimed identity).
  - Content contains required ticker or link.
  - Still live after N hours (for this step, simulate with a re-check stub and TTL).
  - Dedup per job/claim; respect perKOL and global caps.
- Implementation: `CampaignVerifier` interface; default mock verifier in tests. Real X integration later via MCP/server-side verifiers.

## Payout rules

- Pay per verified post up to:
  - perKOLCap × perProofAmount per KOL,
  - job maxProofs × perProofAmount overall,
  - budget.
- Refunds: On close/deadline, unspent escrow returns to the agent.
- Platform fee placeholder: record a configurable platform fee (bps) for future economics; do not collect or move funds in this step.

## Abuse and sybil considerations

- KOL wallet identity per chain; bind X handle to KOL record (existing directory + registrations).
- Enforce perKOL caps; require unique URLs; throttle submits; simple URL domain allowlist.
- Manual review hooks via verifier detail; add audit logs on verify/payout in persistence.
- Flag duplicate content, self-retweets, deleted posts; require minPostAgeHours.

## Multichain identity and assets

- Store chainId + asset per job; chain-native wallet identity per KOL:
  - Solana: wallet (base58 pubkey)
  - EVM: address (0x…)
  - Others as added (Sui, etc.)
- Fee handling: platform fee recorded per job; future distribution via onchain rules per chain.
- Chains to prioritize: Solana (devnet/sim) first; Base/Ethereum stubs; TCLK as optional rail later.

## API (behind JOBS_ENABLED)

All endpoints are test-only; simulated or devnet-only. Do not touch existing launch fee-split logic.

- POST /api/jobs/campaigns
  - body: { chainId, asset, budget, perProofAmount, maxProofs, perKOLCap, deadline, rules: { requiredTicker?, requiredLink?, minPostAgeHours? } }
  - auth: agent API key
  - returns: job draft (status=created)
- POST /api/jobs/:id/fund
  - body: { rail?: 'solana-devnet'|'sim', simulate?: true }
  - returns: escrowRef, status=funded
- GET /api/jobs/open
  - list fund-open campaign jobs (for discovery)
- POST /api/jobs/:id/claim
  - KOL wallet-signs "crew-job-claim:{jobId}:{ts}" (per chain); binds handle/wallet on claim
- POST /api/jobs/:id/submit
  - body: { urls: string[] }
  - KOL wallet-signed; returns submission id
- POST /api/jobs/:id/verify
  - auth: agent API key; runs verifier (mock in tests), updates verification state
- POST /api/jobs/:id/payout
  - auth: agent API key; simulated release for verified submissions (respects caps); returns release records
- POST /api/jobs/:id/refund
  - auth: agent API key; refund unspent budget to agent (simulated/devnet stub)
- POST /api/jobs/campaigns/dry-run
  - auth: agent API key; does not persist; returns computed caps and plan

## Audits and mainnet readiness

- Before mainnet launch:
  - Escrow program/contract audit (per chain), invariant proofs, adversarial testing.
  - End-to-end accounting and onchain/offchain reconciliation.
  - KYC/AML and fraud controls as applicable by jurisdiction.
  - Clear ToS and disclosures; no implicit employment relationships.

## Mapping to TCLK (later)

- Add a TCLK settlement rail implementing the adapter (fund/lock/release/refund/verifyFunding).
- Encode campaign payouts as TCLK flows (alternative settlement leg), preserving per-proof caps and deadlines.

## Flags and safety

- `JOBS_ENABLED` (default off) gates endpoints and MCP tools.
- `JOBS_RAIL` may default to 'sim' in dev/tests.
- All code is test/devnet only in this step; no mainnet funds moved.

## Addendum: Non-custodial rails and multichain defaults (v0 update)

- Rails are non-custodial-first: the server never accepts private keys; payout/refund returns unsigned transactions for client signature.
- Solana devnet: program-less holder model — unsigned SystemProgram.transfer messages for payouts; true escrow via PDA/program is future and must be audited before mainnet.
- EVM: unsigned EIP-1559 transfers; default Base Sepolia, Ethereum Sepolia via config.
- Platform fee: configurable via env (bps + optional wallet). Default 0; treat numbers as TBD.
- Verification: allow explicit agent approval plus optional link checks; optional auto-release timeout window for UX.

