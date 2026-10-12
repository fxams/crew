import { describe, it, expect, beforeAll } from "vitest";
import { FlopTclkAdapter } from "./flop-adapter.js";

describe("FlopTclkAdapter (memory rail)", () => {
  let adapter: FlopTclkAdapter;
  beforeAll(async () => {
    adapter = new FlopTclkAdapter({ rail: "memory" });
    await adapter.init();
  });

  it("runs fund → accept → submit → verify → release on memory rail", async () => {
    const refundAfterMs = Date.now() + 60_000;
    const funded = await adapter.fund({
      statement: "test job: write a short post",
      asset: "TEST",
      amount: "1000",
      refundAfterMs,
    });
    expect(funded.status.state).toBe("funded");
    expect(funded.status.railStatus).toBe("locked");

    const accepted = await adapter.accept(funded.ref);
    expect(accepted.state).toBe("accepted");
    expect(accepted.railStatus).toBe("locked");

    const submitted = await adapter.submit(funded.ref, {
      artifactUri: "ipfs://bafy...test-cid",
      notes: "draft link",
    });
    expect(submitted.state).toBe("submitted");
    expect(submitted.railStatus).toBe("locked");

    const verified = await adapter.verify(funded.ref);
    expect(verified.state).toBe("verified");
    expect(verified.railStatus).toBe("locked");

    const released = await adapter.release(funded.ref, funded.preimage);
    expect(released.state).toBe("released");
    expect(released.railStatus).toBe("claimed");
  });

  it("allows refund after timeout", async () => {
    const refundAfterMs = Date.now() - 1; // already past
    const funded = await adapter.fund({
      statement: "timeout refund test",
      asset: "TEST",
      amount: "1",
      refundAfterMs,
    });
    // Status reports timed_out while rail is still locked
    const s = await adapter.status(funded.ref);
    expect(s.state).toBe("timed_out");
    expect(s.railStatus).toBe("locked");
    const refunded = await adapter.refund(funded.ref);
    expect(refunded.state).toBe("refunded");
    expect(refunded.railStatus).toBe("refunded");
  });
});

