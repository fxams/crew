# Clanker launch rail (Base)

CrewPay can build **unsigned** Clanker v4 deploy transactions on Base (default **Base Sepolia** for tests). The agent signs locally; CrewPay never holds the launcher key.

## Enablement

| Variable | Purpose |
| --- | --- |
| `CLANKER_ENABLED` | `1` / `true` to enable |
| `CLANKER_CHAIN` | `base-sepolia` (default) or `base` |
| `CLANKER_RPC_URL` | Optional RPC override |
| `CLANKER_TREASURY_ADDRESS` | 0x treasury in the fee map (falls back to `ZORA_TREASURY_ADDRESS` / `CREW_BUYBACK_WALLET_EVM`) |

API: `POST /api/agent/launch/unsigned` with `platform: "clanker"`. MCP: `crew_build_unsigned` with the same `platform`.

## Fee map → Clanker rewards

CrewPay’s unchanged launch map (**60% KOL crew / 15% launching agent / 25% treasury**, or **60/15/5/20** with a bound KOL referral) is encoded as Clanker v4 `rewards.recipients` (`rewardBps` totaling 10,000). Crew wallets must be **EVM (0x…)** on Base, same as Zora.

## Protocol-fee gap (documented, not guessed)

Clanker charges a **separate protocol fee** on swap volume (documented as ~20% of the creator LP fee layer). That cut is **not** part of CrewPay’s 60/15/25 map and **cannot** be redirected by reward recipients alone. Swap fees paid by traders are higher than the creator bps alone. CrewPay maps only the creator reward pool; operators should read [Clanker creator rewards](https://clanker.gitbook.io/documentation/general/creator-rewards-and-fees).

## Safety

- Use **Base Sepolia** or mocks in CI; do not run real mainnet launches from automation.
- CrewPay does not change on-chain fee config on live contracts.
