# Clanker launch rail (Base)

CrewPay can build **unsigned** Clanker v4 deploy transactions on **Base mainnet** (production uses `CLANKER_CHAIN=base`). **Base Sepolia** remains available for tests via `CLANKER_CHAIN=base-sepolia`. The agent signs locally; CrewPay never holds the launcher key.

## Enablement

| Variable | Purpose |
| --- | --- |
| `CLANKER_ENABLED` | `1` / `true` to enable |
| `CLANKER_CHAIN` | `base` (mainnet) or `base-sepolia` (testnet) |
| `CLANKER_RPC_URL` | Optional RPC override |
| `CLANKER_TREASURY_ADDRESS` | 0x treasury in the fee map (falls back to `ZORA_TREASURY_ADDRESS` / `CREW_BUYBACK_WALLET_EVM`) |

API: `POST /api/agent/launch/unsigned` with `platform: "clanker"`. MCP: `crew_build_unsigned` with the same `platform`. `GET /api/platforms` reports the active chain (`base` vs `base-sepolia`).

## Fee map → Clanker rewards

CrewPay’s unchanged launch map (**60% KOL crew / 15% launching agent / 25% treasury**, or **60/15/5/20** with a bound KOL referral) is encoded as Clanker v4 `rewards.recipients` (`rewardBps` totaling 10,000).

**KOL payout wallets:** Crew wallets must be **EVM (0x…)** on Base. Each hired KOL needs a **Base payout wallet** on their CrewPay profile (`evm_wallet` / Base address) so Autohire and fee-share routing can pay them on Clanker launches.

## Protocol-fee gap (documented, not guessed)

Clanker charges a **separate protocol fee** on swap volume (documented as ~20% of the creator LP fee layer). That cut is **not** part of CrewPay’s 60/15/25 map and **cannot** be redirected by reward recipients alone. Swap fees paid by traders are higher than the creator bps alone. CrewPay maps only the creator reward pool; operators should read [Clanker creator rewards](https://clanker.gitbook.io/documentation/general/creator-rewards-and-fees).

## Safety

- Use **Base Sepolia** or mocks in CI; point production at **Base mainnet** only when `CLANKER_CHAIN=base` is intentional.
- CrewPay does not change on-chain fee config on live contracts.
