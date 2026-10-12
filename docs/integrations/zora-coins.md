# Zora coins (Base)

CrewPay can build **unsigned EIP-1559** Zora content-coin launches on the same endpoints as Pump.fun:

- `POST /api/agent/launch/unsigned` with `"platform": "zora"`
- MCP `crew_build_unsigned` (`platform=zora`)
- `POST /api/agent/launch/submit` / `crew_submit_signed` (`platform=zora`, signed **hex** txs)

Off unless `ZORA_ENABLED` is set. `platform` defaults to `pumpfun`.

## Networks

| Env | Meaning |
| --- | --- |
| `ZORA_ENABLED=1` | Turn the venue on |
| `ZORA_CHAIN=base-sepolia` | Default — Base Sepolia (`84532`) for testing |
| `ZORA_CHAIN=base` | Base mainnet (`8453`) |
| `ZORA_RPC_URL` | Optional RPC override |
| `ZORA_TREASURY_ADDRESS` or `CREW_BUYBACK_WALLET_EVM` | Treasury recipient on the 0xSplits |
| `ZORA_PLATFORM_REFERRER` | CrewPay platform referrer (defaults to treasury) |

Do not commit secrets. Tests mock RPC / SDK calls and never broadcast.

## Flow (non-custodial)

1. Same KOL order: explicit `crew[]` first, Autohire second. `optInOnly` optional and off by default.
2. Zora crew wallets must be **EVM** (`0x…`). Pass `wallet` as a Base address or `evmWallet` on each seat. Autohire Solana directory wallets work only when the KOL registered `evm_wallet`.
3. Builder:
   - Encodes a **0xSplits** `createSplitDeterministic` (pull split) with 60% hired KOL crew / 15% launching agent / rest treasury (5% referrer when the referrer wallet is EVM).
   - Calls Zora `createCoinCall` / factory with `payoutRecipientOverride` = predicted split and CrewPay as `platformReferrer`.
   - Returns two type-2 txs: `split`, then `zora_create`.
4. Sign locally (launcher is the EVM burner). Submit hex via the existing submit endpoint.

## Fee routing

| Slice | Default | Referred |
| --- | --- | --- |
| Hired KOL crew | **60%** of creator rewards (via 0xSplits) | **60%** |
| Launching agent | **15%** | **15%** |
| Referrer KOL | — | **5%** when the referrer has an EVM wallet |
| CrewPay treasury | rest (`treasuryBps` 2000–3000) | rest |

Zora’s **platform referrer** (CrewPay) is a separate protocol trade-fee share. It is not the 60% crew slice. The launching agent does **not** receive 60%.

## Safety

- Default chain is Base Sepolia so tests/dev do not touch Base mainnet.
- No custodial keys. Unsigned txs only.
