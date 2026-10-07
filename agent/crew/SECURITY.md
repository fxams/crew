# CREW security

Static GitHub Pages app. No backend, no API keys in the client, no private keys in storage.

## What we harden

| Control | Detail |
| --- | --- |
| RPC URL | `assertSafeRpcUrl` — HTTPS only, no credentials, blocks localhost / private hosts |
| Board storage | `sanitizeBoard` strips HTML/control chars, caps array sizes, drops unknown modes, rejects prototype-pollution keys |
| Launch input | `validateDraft` — wallets via `PublicKey`, X handles, 100% share sum, hire roles in agent mode |
| CSP | Meta CSP in `index.html` — scripts/styles scoped; connect to HTTPS/WSS for RPC + wallets |
| Agent brief | Display-only name / model / objective — never stores API keys |
| Platform cut | Fixed **25% CREW buyback** to `VITE_CREW_BUYBACK_WALLET`; desk/agent reserve (mode %) goes to the **launcher wallet** |

## npm audit

Run `npm audit` in `agent/crew` after install.

Most remaining findings are **transitive** through `@pump-fun/pump-sdk` → `@coral-xyz/anchor` (`toml`) and `@solana/web3.js` / `@solana/spl-token` (`bigint-buffer`). Forced `npm audit fix --force` downgrades `pump-sdk` to 1.x and breaks mainnet `createV2` + fee-share.

Mitigations in place:

- `overrides.uuid` → `^11.1.1` (jayson nested copy)
- Browser build uses `bigint-buffer` browser entry (no native addon)
- Wallet signing stays in Phantom — CREW never sees seed phrases

Re-audit when `@pump-fun/pump-sdk` or `@solana/web3.js` ship dependency bumps.

## Pump handle → wallet lookup

CREW resolves `@handle` → Solana wallet via Pump’s public user API
(`frontend-api-v3.pump.fun/users/{username}` → `canonical_svm_wallet`).

That API is CORS-locked to `pump.fun`, so GitHub Pages uses a read-only proxy
(`VITE_PUMP_RESOLVE_PROXY`, default allorigins `/get`). Only handle-shaped paths
are requested — never arbitrary URLs. Auto-fill never overwrites a wallet the
user typed manually. Always confirm the address in Phantom before signing.

## Threat notes

- **XSS via localStorage**: mitigated by sanitize-on-load / sanitize-on-save
- **SSRF via custom RPC**: blocked for non-HTTPS and private hosts; production should set `VITE_RPC_URL` to a trusted provider
- **Phishing**: users must verify mint + fee-share txs in their wallet before signing
- **Social handles**: X handles are tape labels; fee recipients are Solana wallets (Pump-linked when available)


## Reporting

Open a GitHub issue on [fxams/crew](https://github.com/fxams/crew) with `[security]` in the title. Do not open public issues for unfixed critical vulns — email the maintainers first.
