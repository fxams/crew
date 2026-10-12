/* eslint-disable no-console */
import crypto from "node:crypto";
import type {
  EscrowLifecycleState,
  EscrowStatus,
  FundArgs,
  FundResult,
  JobEscrowAdapter,
  JobSubmission,
} from "./types.js";

type RailStatus = "locked" | "claimed" | "refunded";

export interface HtlcRecord {
  status: RailStatus;
  lock: "hash";
  // Hash digest; 0x-prefixed, 32 bytes
  digest: `0x${string}`;
  // Cleartext secret (not on real rails; included here to simplify tests)
  secret?: `0x${string}`;
  // Caller supplied binding to external job spec
  statement: string;
  // Opaque amount/asset; here for compatibility with future rails
  amount: string;
  asset: string;
  // Absolute time (ms since epoch) when refund becomes eligible
  refundAfterMs: number;
  // Timestamps
  createdAtMs: number;
  claimedAtMs?: number;
  refundedAtMs?: number;
}

export interface HtlcRail {
  id: "memory" | "flop-htlc" | "in-memory-shim";
  lock(rec: Omit<HtlcRecord, "status" | "createdAtMs" | "claimedAtMs" | "refundedAtMs">): Promise<string>;
  verifyLock(rec: Pick<HtlcRecord, "digest" | "statement" | "refundAfterMs">, ref: string): Promise<boolean>;
  claim(ref: string, preimage: `0x${string}`): Promise<void>;
  refund(ref: string, nowMs?: number): Promise<void>;
  read(ref: string): Promise<HtlcRecord | undefined>;
}

// Best-effort adapter to @flop-labs/tclk memory rail when present; otherwise
// fall back to a local, test-only in-memory HTLC rail with equivalent behavior.
async function createDefaultRail(): Promise<HtlcRail> {
  // Try to import tclk and use its MemoryRail if available
  try {
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports
    const tclk: any = await import("@flop-labs/tclk");
    if (tclk?.MemoryRail) {
      const rail = new tclk.MemoryRail();
      // Wrap to match our interface
      const wrapper: HtlcRail = {
        id: "memory",
        async lock(args) {
          // tclk MemoryRail likely defines a slightly different API; normalize here.
          // We store the secret alongside to make tests deterministic.
          const ref = await rail.lock({
            status: "locked",
            lock: "hash",
            digest: args.digest,
            statement: args.statement,
            refundAfterMs: args.refundAfterMs,
            amount: args.amount,
            asset: args.asset,
          });
          // Stash secret if MemoryRail does not persist it
          try {
            const r = await rail.read(ref);
            if (r && !r.secret && (args as any).secret) {
              r.secret = (args as any).secret;
              await rail._forceWrite?.(ref, r);
            }
          } catch {
            // ignore
          }
          return ref as string;
        },
        async verifyLock(terms, ref) {
          const r = await rail.read(ref);
          return !!r && r.status === "locked" && r.digest === terms.digest && r.statement === terms.statement && r.refundAfterMs === terms.refundAfterMs;
        },
        async claim(ref, preimage) {
          await rail.claim(ref, preimage);
        },
        async refund(ref, nowMs) {
          const r = await rail.read(ref);
          if (!r) return;
          const now = nowMs ?? Date.now();
          if (r.status === "locked" && now >= r.refundAfterMs) {
            await rail.refund(ref);
          }
        },
        async read(ref) {
          return (await rail.read(ref)) as HtlcRecord | undefined;
        },
      };
      return wrapper;
    }
  } catch {
    // ignore; fall back to shim
  }
  return new InMemoryHtlcRail();
}

export class InMemoryHtlcRail implements HtlcRail {
  public readonly id = "in-memory-shim" as const;
  private store = new Map<string, HtlcRecord>();

  async lock(args: Omit<HtlcRecord, "status" | "createdAtMs" | "claimedAtMs" | "refundedAtMs">): Promise<string> {
    const ref = crypto.randomBytes(16).toString("hex");
    const rec: HtlcRecord = {
      status: "locked",
      createdAtMs: Date.now(),
      ...args,
    };
    this.store.set(ref, rec);
    return ref;
  }

  async verifyLock(terms: Pick<HtlcRecord, "digest" | "statement" | "refundAfterMs">, ref: string): Promise<boolean> {
    const rec = this.store.get(ref);
    if (!rec) return false;
    return rec.status === "locked" && rec.digest === terms.digest && rec.statement === terms.statement && rec.refundAfterMs === terms.refundAfterMs;
  }

  async claim(ref: string, preimage: `0x${string}`): Promise<void> {
    const rec = this.store.get(ref);
    if (!rec) throw new Error("missing record");
    if (rec.status !== "locked") throw new Error("not claimable");
    const digest = hash256(preimage);
    if (digest !== rec.digest) throw new Error("invalid preimage");
    rec.status = "claimed";
    rec.claimedAtMs = Date.now();
  }

  async refund(ref: string, nowMs?: number): Promise<void> {
    const rec = this.store.get(ref);
    if (!rec) throw new Error("missing record");
    if (rec.status !== "locked") throw new Error("not refundable");
    const now = nowMs ?? Date.now();
    if (now < rec.refundAfterMs) throw new Error("refund not yet eligible");
    rec.status = "refunded";
    rec.refundedAtMs = now;
  }

  async read(ref: string): Promise<HtlcRecord | undefined> {
    const rec = this.store.get(ref);
    return rec ? { ...rec } : undefined;
  }
}

function randomPreimage(): `0x${string}` {
  return `0x${crypto.randomBytes(32).toString("hex")}`;
}

function hash256(preimage: `0x${string}`): `0x${string}` {
  const h = crypto.createHash("sha256");
  h.update(Buffer.from(preimage.slice(2), "hex"));
  return `0x${h.digest("hex")}`;
}

export interface FlopTclkAdapterOptions {
  // When true, attempts to use a real FLOP testnet rail if FLOP_RPC_URL / FLOP_CHAIN_ID are set.
  enabled?: boolean;
  // Target rail. "memory" is used for tests; "flop-htlc" is a placeholder until FLOP testnet RPC is public.
  rail?: "memory" | "flop-htlc";
  // FLOP chain connection details (unused for memory rail).
  flopRpcUrl?: string;
  flopChainId?: string | number;
}

type EscrowAux = {
  accepted: boolean;
  submitted?: JobSubmission;
  verified?: boolean;
};

// Adapter that maps CrewPay's job escrow lifecycle to a tclk-style HTLC rail.
// - fund     → lock
// - accept   → no-op on rail (verifyLock off-rail)
// - submit   → off-rail metadata only
// - verify   → off-rail check only
// - release  → claim (reveal)
// - refund   → refund (after timeout)
export class FlopTclkAdapter implements JobEscrowAdapter {
  private rail: HtlcRail | null = null;
  private aux = new Map<string, EscrowAux>();
  private options: FlopTclkAdapterOptions;

  constructor(options?: FlopTclkAdapterOptions) {
    const env = process?.env ?? {};
    this.options = {
      enabled: options?.enabled ?? (env.FLOP_ENABLED === "true"),
      rail: options?.rail ?? "memory",
      flopRpcUrl: options?.flopRpcUrl ?? env.FLOP_RPC_URL,
      flopChainId: options?.flopChainId ?? env.FLOP_CHAIN_ID,
    };
  }

  async init(): Promise<void> {
    if (this.options.rail === "flop-htlc") {
      // Reserved for future FLOP testnet bindings; not available yet.
      // Keep explicit error to avoid silent misuse.
      throw new Error("flop-htlc rail is not available yet; use memory rail for now");
    }
    this.rail = await createDefaultRail();
  }

  private ensureRail(): HtlcRail {
    if (!this.rail) throw new Error("adapter not initialized; call init()");
    return this.rail;
  }

  async fund(args: FundArgs): Promise<FundResult> {
    const rail = this.ensureRail();
    const preimage = randomPreimage();
    const digest = hash256(preimage);
    const ref = await rail.lock({
      lock: "hash",
      digest,
      secret: preimage,
      statement: args.statement,
      refundAfterMs: args.refundAfterMs,
      amount: args.amount,
      asset: args.asset,
    });
    this.aux.set(ref, { accepted: false });
    const railRec = await rail.read(ref);
    return {
      ref,
      preimage,
      hash: digest,
      status: this.mapStatus(railRec, /*accepted*/ false, /*submitted*/ false, /*verified*/ false),
    };
  }

  async accept(ref: string): Promise<EscrowStatus> {
    const rail = this.ensureRail();
    const aux = this.aux.get(ref);
    if (!aux) this.aux.set(ref, { accepted: true });
    else aux.accepted = true;
    const rec = await rail.read(ref);
    return this.mapStatus(rec, true, !!aux?.submitted, !!aux?.verified);
  }

  async submit(ref: string, work: JobSubmission): Promise<EscrowStatus> {
    const rail = this.ensureRail();
    const aux = this.aux.get(ref);
    if (!aux) this.aux.set(ref, { accepted: false, submitted: work });
    else aux.submitted = work;
    const rec = await rail.read(ref);
    return this.mapStatus(rec, !!aux?.accepted, true, !!aux?.verified);
  }

  async verify(ref: string): Promise<EscrowStatus> {
    const rail = this.ensureRail();
    const aux = this.aux.get(ref);
    if (!aux) this.aux.set(ref, { accepted: false, verified: true });
    else aux.verified = true;
    const rec = await rail.read(ref);
    return this.mapStatus(rec, !!aux?.accepted, !!aux?.submitted, true);
  }

  async release(ref: string, preimage: `0x${string}`): Promise<EscrowStatus> {
    const rail = this.ensureRail();
    await rail.claim(ref, preimage);
    const aux = this.aux.get(ref);
    const rec = await rail.read(ref);
    return this.mapStatus(rec, !!aux?.accepted, !!aux?.submitted, !!aux?.verified);
  }

  async refund(ref: string): Promise<EscrowStatus> {
    const rail = this.ensureRail();
    await rail.refund(ref);
    const aux = this.aux.get(ref);
    const rec = await rail.read(ref);
    return this.mapStatus(rec, !!aux?.accepted, !!aux?.submitted, !!aux?.verified);
  }

  async status(ref: string): Promise<EscrowStatus> {
    const rail = this.ensureRail();
    const aux = this.aux.get(ref);
    const rec = await rail.read(ref);
    return this.mapStatus(rec, !!aux?.accepted, !!aux?.submitted, !!aux?.verified);
  }

  private mapStatus(rec: HtlcRecord | undefined, accepted: boolean, submitted: boolean, verified: boolean): EscrowStatus {
    if (!rec) throw new Error("unknown ref");
    let state: EscrowLifecycleState;
    switch (rec.status) {
      case "locked":
        if (verified) state = "verified";
        else if (submitted) state = "submitted";
        else if (accepted) state = "accepted";
        else state = "funded";
        break;
      case "claimed":
        state = "released";
        break;
      case "refunded":
        state = "refunded";
        break;
      default:
        state = "funded";
    }
    // Timed out is a derived state: still locked and past refundAfterMs
    if (rec.status === "locked" && Date.now() >= rec.refundAfterMs) {
      state = "timed_out";
    }
    return {
      state,
      railStatus: rec.status,
      refundAfterMs: rec.refundAfterMs,
    };
  }
}

// Convenience factory with env defaults; useful for tests and future glue.
export async function createFlopAdapterFromEnv(): Promise<FlopTclkAdapter> {
  const adapter = new FlopTclkAdapter({
    enabled: process.env.FLOP_ENABLED === "true",
    rail: (process.env.FLOP_RAIL as any) ?? "memory",
    flopRpcUrl: process.env.FLOP_RPC_URL,
    flopChainId: process.env.FLOP_CHAIN_ID,
  });
  await adapter.init();
  return adapter;
}

