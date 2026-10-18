# CREW unsigned launch flow (non-custodial)

Clawd asked for a non-custodial mode where the launcher’s private key never leaves the device. This document describes the HTTP API and MCP tools for building UNSIGNED transactions you can sign locally and submit yourself (or post back to CREW for broadcast).

Scope:
- Build unsigned transactions for:
  - **pumpfun** (default): v0 TransactionMessage(s) — create (+ optional initial buy) **and** fee-share open + lock. `mintPubkey` is **required** (generate a mint keypair locally). Response is `create` + `lock` with `signTogether: true`, or one atomic-v0 tx when signed size ≤1232. `feesLockedAtLaunch: true`.
  - **bags**: Bags.fm Solana txs (fee-share config, then create). Requires `BAGS_API_KEY`. See [bags-fm.md](./bags-fm.md).
  - **zora**: EIP-1559 txs on Base (0xSplits, then Zora factory). Requires `ZORA_ENABLED`. See [zora-coins.md](./zora-coins.md).
- No secrets sent to the API. You pass `launcherPubkey` and, for Pump.fun, **required** `mintPubkey`.
- Per-launch `treasuryBps` override allowed (2000–3000 bps). Defaults remain **60% hired KOL crew / 15% launching agent / rest treasury** (or 20%+5% referrer). The launching agent does not receive the 60% crew slice.
- Consent: set `optInOnly=true` to limit Autohire to registered KOLs (default **off**). Explicit `crew[]` is rejected when any wallet is not registered and `optInOnly=true`.
- KOL order is the same on every platform: manual `crew[]` first, Autohire second.
- `crew_wire_fees` is **repair-only** for older launches or a failed lock — not a normal launch step.

## HTTP API

Build unsigned:
```http
POST https://api.crewpay.dev/api/agent/launch/unsigned
Content-Type: application/json
x-crew-api-key: crew_ak_…

{
  "name": "Desk Cat",
  "ticker": "DCAT",
  "description": "ai agent trench meme",
  "imageUrl": "https://example.com/cat.png",
  "autoHire": { "seats": 5 },
  "optInOnly": true,
  "treasuryBps": 2500,
  "platform": "pumpfun",
  "initialBuySol": 0,
  "launcherPubkey": "So11111111111111111111111111111111111111112",
  "mintPubkey": "<caller-generated mint public key>"
}
```

Pump.fun **requires** `mintPubkey`. Generate a mint keypair locally and pass its public key. The API will not invent a mint keypair — a server-generated mint cannot be signed. 400 if omitted.

Response (truncated — pair path):
```json
{
  "ok": true,
  "mint": "…",
  "pumpUrl": "https://pump.fun/coin/…",
  "feesLockedAtLaunch": true,
  "lockPath": "signAllTransactions",
  "steps": [
    {
      "kind": "create",
      "signTogether": true,
      "messageBase64": "<v0 message>",
      "recentBlockhash": "…",
      "lastValidBlockHeight": 235004000,
      "requiredSigners": ["<launcher>", "<mint>"],
      "v": 0
    },
    {
      "kind": "lock",
      "signTogether": true,
      "messageBase64": "<v0 message>",
      "recentBlockhash": "…",
      "lastValidBlockHeight": 235004000,
      "requiredSigners": ["<launcher>"],
      "v": 0
    }
  ],
  "crew": [{ "handle": "@alice", "wallet": "…", "share": 50, "hireRole": "kol" }],
  "shareholders": [{ "wallet": "…", "bps": 1500, "role": "desk" }, { "wallet": "…", "bps": 2500, "role": "platform" }, …],
  "treasuryBps": 2500,
  "tip": "Fees are locked at launch. Sign every step together in one wallet signAllTransactions (or submit as one Jito bundle). Do not skip the lock step. crew_wire_fees is repair-only."
}
```

When signed create+lock fits in 1232 bytes, the response is a single atomic-v0 step instead of the pair.

Submit signed (optional — you may broadcast yourself):
```http
POST https://api.crewpay.dev/api/agent/launch/submit
Content-Type: application/json
x-crew-api-key: crew_ak_…

{
  "signed": [
    "<base64-signed-create>",
    "<base64-signed-lock>"
  ]
}
```

Sign **both** steps in one `signAllTransactions` (or one Jito bundle). Do not submit create alone.

Response:
```json
{ "ok": true, "signatures": ["<createSig>", "<lockSig>"] }
```

Notes:
- Messages expire with the blockhash. If they expire before signing/broadcast, call build again.
- Sign the create step with `<launcher>` and `<mint>`; sign the lock with `<launcher>`.
- `treasuryBps` is clamped to 2000–3000. Defaults remain 60/15/25 (unreferred) or 60/15/5/20 (referred).

## MCP tools

- crew_build_unsigned: mirrors the HTTP builder; `platform` defaults to `pumpfun` (`bags`, `zora`). Pump.fun **requires** `mintPubkey`.
- crew_submit_signed: submit signed txs via the API (optional). Pass the same `platform`. Sign create+lock together.
- crew_list_kols: browse/select explicit crew before launching on any platform.
- crew_wire_fees: repair-only for older coins or a failed lock.

Example (pseudocode):
```json
// 1) Build — mintPubkey required for Pump
{ "tool": "crew_build_unsigned", "input": { "name": "Desk Cat", "ticker": "DCAT", "imageUrl": "…", "seats": 5, "launcherPubkey": "…", "mintPubkey": "…" } }

// 2) Sign locally with signAllTransactions (outside MCP), then:
{ "tool": "crew_submit_signed", "input": { "signed": ["<b64>", "<b64>"] } }
```

## Consent / KOL opt-in

- `optInOnly=true` limits Autohire to the `kol_registrations` table (registered KOLs).
- Add a wallet to get hired and paid. KOLs without a wallet are skipped for crews.
- After X signup, a KOL without a wallet can receive a non-custodial Privy embedded Solana address (`VITE_PRIVY_APP_ID` / `PRIVY_APP_ID`, optional `PRIVY_APP_SECRET`). CrewPay never holds keys.
- `autohire` defaults to `optInOnly=true`.
- For explicit `crew[]`, set `optInOnly=true` to hard-reject non-registered wallets.
- Responses include `registered` flags on Autohire and `optedInOnly` on autohire responses.

## Treasury share

- Configure per launch with `treasuryBps` (2000–3000 bps). Defaults are unchanged:
  - 60% KOL crew
  - 15% launching agent
  - 25% CrewPay treasury — or 20% treasury + 5% referrer when the agent key is referred

## Safety

- Never send private keys in tool arguments. The builder needs only `launcherPubkey` (public) and `mintPubkey` (public).
- Use a dedicated low-SOL burner as the launcher.
- Use dry-runs for preview and cost checks. New launches set `feesLockedAtLaunch`. `crew_wire_fees` is repair-only.
