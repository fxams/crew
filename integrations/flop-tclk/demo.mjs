#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// CrewPay × tclk/1 demo — LOCAL ONLY, NO VALUE, DRY-RUN ONLY.
//
// Two agents that share nothing but a Technocore venue agree a KOL job using the
// Technocore Lock Protocol (tclk/1, @flop-labs/tclk, Apache-2.0) on the `paper` rail
// (a rehearsal rail that backs the lifecycle with NOTHING):
//
//   offer -> accept -> lock -> reveal (claim) -> third-party fold/verify
//
// Then the launcher agent calls CrewPay's crew_launch_dry_run (hosted MCP, falling back
// to the REST dry-run endpoint). A dry-run never touches the chain: it returns a fee map
// and a hire plan, and a real launch would still need an operator wallet signature.
//
// Safety rails in this script:
//   * Refuses a non-local venue unless DEMO_ALLOW_PUBLIC_VENUE=1 (default: localhost).
//   * Only ever calls the CrewPay dry-run tool / endpoint. There is no launch call here.
//   * Never prints the API key, and does not print the approval URL.
//
// Run: see README.md.

import { randomBytes } from "node:crypto";
import {
  OFFER_ROOM, PaperRail, applyFrame, dealRoom, encodeFrame, generateHashLock, lockTerms,
  makeAccept, makeOffer, openContract, paperNote, stateNote, stateNoteValue,
  tclkStatusToA2A, tryDecodeFrame,
} from "@flop-labs/tclk";
import { canonicalMessage, nextNonce, signerFromSeed, sweep } from "@flop-labs/tclk-mcp/dist/signing.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import { base58, base64urlnopad } from "@scure/base";

// @flop-labs/tclk 0.1.0 (the npm release) predates the repo's transcript helpers, so the
// third-party check below is done here: verify each record's Ed25519 signature over
// `<room>|<nonce>|<text>` against its did:key, require frame.from == transport from,
// then fold the frames through the library's own state machine at the record's venue time.
function pubFromDid(did) {
  const raw = base58.decode(did.slice("did:key:z".length));
  if (raw[0] !== 0xed || raw[1] !== 0x01 || raw.length !== 34) throw new Error("not an ed25519 did:key");
  return raw.slice(2);
}
function verifiedFrames(room, records) {
  const out = [];
  for (const r of records) {
    if (!r.from?.startsWith("did:key:") || !r.sig) continue; // unsigned = data, not a commitment
    const ok = ed25519.verify(base64urlnopad.decode(r.sig), new TextEncoder().encode(canonicalMessage(room, r.nonce, r.text)), pubFromDid(r.from));
    const frame = ok ? tryDecodeFrame(r.text) : null;
    if (frame && frame.from === r.from) out.push({ frame, ts: Date.parse(r.ts) || Number(r.ts) });
  }
  return out;
}

const BASE = process.env.TECHNOCORE_URL ?? "http://127.0.0.1:8080";
const CREW_MCP = process.env.CREWPAY_MCP_URL ?? "https://mcp.crewpay.dev/mcp";
const CREW_API = process.env.CREWPAY_API_URL ?? "https://api.crewpay.dev";
const API_KEY = process.env.CREW_AGENT_API_KEY ?? "";

const host = new URL(BASE).hostname;
if (!["127.0.0.1", "localhost", "::1"].includes(host) && process.env.DEMO_ALLOW_PUBLIC_VENUE !== "1") {
  console.error(`Refusing non-local venue ${BASE}. Run a local technocore-chat (see README) or set DEMO_ALLOW_PUBLIC_VENUE=1.`);
  process.exit(2);
}

const log = (step, detail) => console.log(`${String(step).padEnd(3)} ${detail}`);

async function req(url, init, what) {
  const res = await fetch(url, init);
  if (res.status === 429) throw new Error(`${what}: rate limited`);
  return res;
}
async function must(res, what) {
  if (!res.ok) throw new Error(`${what}: ${res.status} ${(await res.text()).split("\n")[0]}`);
  return res;
}
async function post(signer, room, frame) {
  const text = sweep(encodeFrame(frame));
  const nonce = nextNonce();
  const sig = signer.sign(canonicalMessage(room, nonce, text));
  await must(await req(`${BASE}/r/${room}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ did: signer.did, sig, nonce: String(nonce), text }),
  }, `post ${room}`), `post ${room}`);
}
async function exportRoom(room) {
  const res = await must(await req(`${BASE}/r/${room}/export`, undefined, `export ${room}`), `export ${room}`);
  return (await res.text()).split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
}
// Note store for the paper rail, on the venue's /kv routes (venue prefixes reads with a banner).
const notes = {
  async get(ns, key) {
    const res = await req(`${BASE}/kv/${ns}/${key}`, undefined, "kv get");
    if (res.status === 404) return null;
    await must(res, "kv get");
    const v = (await res.text()).split("\n").filter((l) => !l.startsWith("!!") && l.trim() !== "").join("\n").trimEnd();
    return v === "" ? null : v;
  },
  async set(ns, key, value, cond) {
    const q = cond === undefined ? "" : "ifAbsent" in cond ? "?if_absent=1" : `?if=${encodeURIComponent(cond.if)}`;
    const res = await req(`${BASE}/kv/${ns}/${key}/set/${encodeURIComponent(value)}${q}`, undefined, "kv set");
    if (res.status === 409) return false;
    await must(res, "kv set");
    return true;
  },
};

// ---------------------------------------------------------------- tclk/1 deal
const launcher = signerFromSeed(randomBytes(32)); // payer: the launching AI agent
const kol = signerFromSeed(randomBytes(32));      // payee: the crew / KOL agent
const rail = new PaperRail(notes);
const now = Date.now();

log("", `venue     ${BASE}  (local, private)`);
log("", `launcher  ${launcher.did}`);
log("", `kol       ${kol.did}`);
console.log();

const taskId = `crewpay-kol-${randomBytes(3).toString("hex")}`;
const specNote = { ns: `tclk-job-${taskId.slice(-2)}`, key: taskId.slice(0, 14) };
const spec = "x thread promoting a CrewPay-launched coin | checkable: 3 posts <=280 chars each; posted from the hired handle; contains the mint address";
await notes.set(specNote.ns, specNote.key, spec, { ifAbsent: true });
log(0, `job spec  /kv/${specNote.ns}/${specNote.key}: ${spec}`);

const offer = makeOffer({
  from: launcher.did, role: "payer", lock: "hash",
  amount: "1000000", asset: "PAPER", rails: ["paper"],
  claimByMs: now + 30 * 60_000, refundAfterMs: now + 60 * 60_000, expiresMs: now + 10 * 60_000,
  job: { proto: "a2a", id: taskId, context: `/kv/${specNote.ns}/${specNote.key}` },
});
await post(launcher, OFFER_ROOM, offer);
log(1, `offer     posted to /r/${OFFER_ROOM}  offer id ${offer.id.slice(0, 18)}…  (asset PAPER, rail paper)`);

const lock = generateHashLock();
const accept = makeAccept(offer, { from: kol.did, statement: lock.hash });
await post(kol, OFFER_ROOM, accept);
const room = dealRoom(accept.contract);
const note = stateNote(accept.contract);
log(2, `accept    contract ${accept.contract.slice(0, 18)}…  deal room /r/${room}`);

let launcherView = applyFrame(openContract(offer), accept, Date.now()).state;
let kolView = applyFrame(openContract(offer), accept, Date.now()).state;
await notes.set(note.ns, note.key, stateNoteValue("accepted"), { ifAbsent: true });
log("", `A2A state ${tclkStatusToA2A(launcherView.status)}`);

const ref = await rail.lock(lockTerms(launcherView));
const lockFrame = { type: "lock", from: launcher.did, contract: accept.contract, rail: "paper", ref };
await post(launcher, room, lockFrame);
launcherView = applyFrame(launcherView, lockFrame, Date.now()).state;
kolView = applyFrame(kolView, lockFrame, Date.now()).state;
const held = await rail.verifyLock(lockTerms(kolView), ref);
const pn = paperNote(accept.contract);
log(3, `lock      paper record /kv/${pn.ns}/${pn.key}; KOL verifyLock → ${held}  (A2A ${tclkStatusToA2A(launcherView.status)})`);
if (!held) throw new Error("rail does not hold the lock the frame claims");
await notes.set(note.ns, note.key, stateNoteValue("locked", ref), { if: stateNoteValue("accepted") });

// (In a real job, the KOL would deliver the thread here and the launcher would check it.)
const reveal = { type: "reveal", from: kol.did, contract: accept.contract, secret: lock.preimage };
await post(kol, room, reveal);
await rail.claim(ref, lock.preimage);
await notes.set(note.ns, note.key, stateNoteValue("claimed", ref), { if: stateNoteValue("locked", ref) });
log(4, "reveal    KOL published the preimage; paper record → claimed");

// A reader holding no secrets re-derives the deal from the venue's exports alone.
const board = verifiedFrames(OFFER_ROOM, await exportRoom(OFFER_ROOM));
const offerSeen = board.find((x) => x.frame.type === "offer" && x.frame.id === offer.id);
const acceptSeen = board.find((x) => x.frame.type === "accept" && x.frame.contract === accept.contract);
if (!offerSeen || !acceptSeen) throw new Error("handshake not found on the board");
const dealFrames = verifiedFrames(room, await exportRoom(room));
let audit = openContract(offerSeen.frame); let applied = 0; const steps = [acceptSeen, ...dealFrames];
for (const { frame, ts } of steps) { const r = applyFrame(audit, frame, ts); if (r.ok) { audit = r.state; applied++; } }
log(5, `verify    third-party fold of signed records: ${applied}/${steps.length} frames applied, status ${audit.status} (A2A ${tclkStatusToA2A(audit.status)}), secret opens statement: ${audit.secret === lock.preimage}`);
log("", `paper rail record: ${JSON.stringify(await rail.read(ref))}`);
if (audit.status !== "claimed") throw new Error(`expected claimed, got ${audit.status}`);
console.log();

// ---------------------------------------------------------------- CrewPay dry-run
const dryArgs = {
  intent: "launch",
  name: "Paper Crew",
  ticker: "PCREW",
  description: "Demo only: agent-to-agent job agreed over tclk/1 on a no-value rail. Not a real launch.",
  imageUrl: "https://crewpay.dev/favicon.png",
  seats: 3,
  mode: "agent",
  initialBuySol: 0,
  agentName: "tclk demo launcher",
  agentObjective: "Rehearse hiring a KOL crew after a tclk/1 paper-rail deal (dry-run only).",
};

function summarize(d) {
  const crew = Array.isArray(d.crew) ? d.crew.map((c) => `${c.handle}:${c.hireRole}:${c.effectiveBps}bps`) : [];
  return {
    ok: d.ok, dryRun: d.dryRun, cluster: d.cluster, name: d.name, ticker: d.ticker,
    feeMap: d.feeMap, costs: d.costs && { needSol: d.costs.needSol, note: d.costs.note },
    crewSeats: crew.length, crew, dryRunId: d.dryRunId ? `${String(d.dryRunId).slice(0, 8)}…` : undefined,
    approvalUrl: d.approvalUrl ? "(returned, not printed)" : undefined,
  };
}

async function viaMcp() {
  const headers = { "content-type": "application/json", accept: "application/json, text/event-stream", "x-crew-api-key": API_KEY };
  const rpc = async (body, sid) => {
    const res = await fetch(CREW_MCP, { method: "POST", headers: sid ? { ...headers, "mcp-session-id": sid } : headers, body: JSON.stringify(body) });
    const text = await res.text();
    if (!res.ok) throw new Error(`MCP ${res.status} ${text.slice(0, 160)}`);
    const line = text.split("\n").find((l) => l.startsWith("data:"));
    return { sid: res.headers.get("mcp-session-id") ?? sid, msg: line ? JSON.parse(line.slice(5)) : (text ? JSON.parse(text) : null) };
  };
  const init = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "crewpay-tclk-demo", version: "0.1.0" } } });
  await fetch(CREW_MCP, { method: "POST", headers: { ...headers, ...(init.sid ? { "mcp-session-id": init.sid } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) });
  const call = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "crew_launch_dry_run", arguments: dryArgs } }, init.sid);
  const result = call.msg?.result;
  if (!result || result.isError) throw new Error(`MCP tool error: ${JSON.stringify(result ?? call.msg).slice(0, 200)}`);
  return JSON.parse(result.content[0].text);
}

async function viaRest() {
  const body = {
    intent: "launch", name: dryArgs.name, ticker: dryArgs.ticker, description: dryArgs.description,
    mode: "agent", initialBuySol: 0, holderKol: false, imageUrl: dryArgs.imageUrl,
    agent: { name: dryArgs.agentName, objective: dryArgs.agentObjective, model: "tclk-demo" },
    autoHire: { seats: dryArgs.seats },
  };
  const res = await fetch(`${CREW_API}/api/agent/launch/dry-run`, { method: "POST", headers: { "content-type": "application/json", "x-crew-api-key": API_KEY }, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`REST ${res.status} ${text.slice(0, 160)}`);
  return JSON.parse(text);
}

if (!API_KEY) {
  log(6, "crewpay   CREW_AGENT_API_KEY not set — skipping dry-run (get one with crew_claim_key).");
} else {
  let data, via;
  try { data = await viaMcp(); via = `MCP ${CREW_MCP} → crew_launch_dry_run`; }
  catch (e) { log("", `MCP path failed (${e.message.slice(0, 120)}); falling back to REST dry-run`); data = await viaRest(); via = `REST ${CREW_API}/api/agent/launch/dry-run`; }
  if (data.dryRun !== true) throw new Error("expected dryRun:true — refusing to continue");
  log(6, `crewpay   ${via}`);
  console.log(JSON.stringify(summarize(data), null, 2));
}
console.log();
console.log("Done. The paper rail held nothing and the CrewPay call was a dry-run: no value moved, no coin launched.");
