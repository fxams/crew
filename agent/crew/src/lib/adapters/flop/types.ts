// Minimal, self-contained job escrow adapter interfaces to keep this change
// independent from PR #109. Designed to plug into a future chain-adapter
// interface with minimal glue.
// This file is Node-only test code and not bundled into the web app.

export type EscrowLifecycleState =
  | "funded" // HTLC locked on rail
  | "accepted" // buyer accepts the job terms
  | "submitted" // worker submitted work artifacts
  | "verified" // buyer verified the submission off-chain
  | "released" // worker claimed funds by reveal
  | "refunded" // buyer refunded after timeout
  | "timed_out"; // reached timeout window (eligible for refund)

export interface JobSubmission {
  // Free-form artifact pointer. In production this would be a content hash,
  // URL, IPFS CID, or similar immutable reference.
  artifactUri: string;
  // Optional notes for tests/demo usage.
  notes?: string;
}

export interface EscrowStatus {
  // Adapter-level lifecycle view mapped from the underlying rail
  state: EscrowLifecycleState;
  // Underlying rail status ("locked" | "claimed" | "refunded")
  railStatus: "locked" | "claimed" | "refunded";
  // Milliseconds-since-epoch timeouts for refund eligibility
  refundAfterMs: number;
}

export interface FundArgs {
  // Summary string that binds the lock to an external job spec or A2A thread
  // (e.g., "x thread promoting a CrewPay-launched coin ...").
  statement: string;
  // ISO asset ticker or canonical id (rail-dependent); for memory rail tests,
  // this is opaque.
  asset: string;
  // Integer-like string amount, opaque to the adapter during memory-rail tests.
  amount: string;
  // Absolute unix time in ms when refund becomes eligible.
  refundAfterMs: number;
}

export interface FundResult {
  // Rail reference/id of the HTLC lock record
  ref: string;
  // Secret the worker reveals to claim. The adapter NEVER transmits this to
  // CrewPay servers; tests keep it entirely local.
  preimage: `0x${string}`;
  // Hash digest bound in the lock
  hash: `0x${string}`;
  // Initial status snapshot
  status: EscrowStatus;
}

export interface JobEscrowAdapter {
  // Initialize adapter; implementations should be pure and non-custodial.
  init(): Promise<void>;

  // Map "fund" → HTLC lock
  fund(args: FundArgs): Promise<FundResult>;

  // Off-rail lifecycle steps to mirror CrewPay's flow
  accept(ref: string): Promise<EscrowStatus>;
  submit(ref: string, work: JobSubmission): Promise<EscrowStatus>;
  verify(ref: string): Promise<EscrowStatus>;

  // Map "release" → HTLC claim (reveal preimage)
  release(ref: string, preimage: `0x${string}`): Promise<EscrowStatus>;

  // Map refund/timeout path
  refund(ref: string): Promise<EscrowStatus>;
  status(ref: string): Promise<EscrowStatus>;
}

