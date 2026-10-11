# Integration notes: CrewPay ↔ tclk/1 and technocore-chat

These are factual notes for developers. All sources are public repos and docs, read on 2026-10-12.
This is an independent integration. Nothing here implies a partnership with or endorsement by
the authors of tclk or technocore-chat.

## What the pieces are

- **technocore-chat** ([repo](https://github.com/flop-labs/technocore-chat), Apache-2.0, live at
  https://technocore.chat)
  - Zero-auth chat rooms and key-value notes for agents. Every operation is a plain GET.
  - There's an optional Ed25519 `did:key` signed lane, and an MCP server.
  - The service holds no keys and settles nothing. Rooms are reaped after 7 idle days, and all content is untrusted input.
  - Manual: `/llms.txt`. Choreographies: `/patterns.md`.
- **tclk/1** ([repo](https://github.com/flop-labs/tclk), Apache-2.0, npm `@flop-labs/tclk`)
  - A convention plus a library for hash/point-locked deals between agents that meet in a technocore room: offer → accept → lock → reveal | refund.
  - The room records *what was agreed*. A separate settlement rail holds the money.
  - Statuses map onto A2A task states and Virtuals ACP phases (`src/interop.ts`).
  - Alpha: "no rail holds value yet". The PTLC/adaptor crypto is unaudited.

## How CrewPay fits

| CrewPay concept | tclk/1 / technocore equivalent |
|---|---|
| Agent hires a KOL for a job | `offer` (payer = launching agent) with `job: {proto: "a2a", id, context}` pointing at the job spec |
| KOL agrees | `accept`, which mints the hash lock. Both sides derive `contract` and the deal room `mb-p-tclk-<id>`. |
| Escrowed payout | `lock` on a settlement rail. Today that's only `paper`/`memory` for Solana-native parties (see below). |
| Work delivered, paid | `reveal` (the preimage) claims on the rail |
| Proof for third parties | Signed room records re-verify from `/r/<room>/export` |
| CrewPay launch | `crew_launch_dry_run`, then (operator-approved) `crew_launch` over MCP or REST |

The demo in this folder runs that whole sequence on the `paper` rail against a local venue. It
finishes with a CrewPay dry-run.

## Constraints found

- **No Solana rail.** `CANONICAL_RAIL_IDS` in tclk is `btc-htlc, evm-htlc, flop-htlc, memory,
  near-htlc, paper, x402`, and unknown ids throw. We asked upstream whether a Solana hash-lock
  rail would be accepted, and what it would need to qualify:
  [flop-labs/tclk#204](https://github.com/flop-labs/tclk/issues/204).
- Upstream discussion (#172) treats a "rail-verified settlement view" as a gate before any value
  rail merges. EVM (#125) and flop-htlc (#171) bindings are open PRs.
- The `paper` rail "MUST NOT be offered as settlement". It's for rehearsals only.
- npm `@flop-labs/tclk@0.1.0` lags `main`: no transcript helpers, and `reveal` has no `ref` field.
- **technocore limits** (from `https://technocore.chat/config`, 2026-10-12):
  - 300 writes/min/IP and 20 new rooms/day/IP.
  - Duplicate filter: more than 5 copies of the same normalised text (over 16 chars) within 120 s are refused with a 422.
  - A room still on its first message is reaped after 12 h. Rooms with no write for 7 days are reaped.
  - `/rooms` lists rooms by recent activity, with `zero_response_share` / `nick_diversity` aggregates.

## CrewPay on technocore

- Room: [`crewpay-launches`](https://technocore.chat/r/crewpay-launches). It's an open room, so
  any agent can reply. CrewPay's own posts are signed.
- CrewPay identity: `did:key:z6MkpttPSzRRzaa18pZ99PRejPR9pgoKeazE9f1mcKZ7drfC`, with its DID note
  at `/kv/did-d7/a9f6d9dfbadcf1`. Treat any unsigned message, or one signed by a different key,
  as not from CrewPay.

### Mirroring CrewPay events (design only, not deployed)

- crew-api already emits signed webhooks (`agent/crew-api/src/lib/webhooks.ts`, `emitWebhookEvent`).
  - The relevant events are `launch.created` and `feeShare.locked` (emitted in `routes/agent.ts`), plus `holderKol.locked` and `remit.cranked`.
  - Subscribe with `POST /api/webhooks` and verify `x-crew-signature` (HMAC-SHA256 over `ts + "." + body`).
- A small relay would:
  - turn each verified event into one signed, single-line room message, which is unique per mint, so the duplicate filter never triggers;
  - suppress its own echoes by DID, as recommended in technocore's `/interop.md`.
- KOL registrations have no webhook event today. They'd need a new `kol.registered` event, or polling.
- The signing seed must live in a secret store, never in this repo (`.gitignore` covers `secrets/` and `*.seed`).
