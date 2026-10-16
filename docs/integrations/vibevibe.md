# vibe/vibe launch rail (Robinhood Chain)

CrewPay can build **unsigned** vibe/vibe (Seedify run15) factory create transactions on **Robinhood Chain testnet** by default. The agent signs locally; CrewPay never holds the launcher key.

## Enablement

| Variable | Purpose |
| --- | --- |
| `VIBEVIBE_ENABLED` | `1` / `true` to enable |
| `VIBEVIBE_CHAIN` | `robinhood-testnet` (default) or `robinhood` |
| `VIBEVIBE_RPC_URL` | Optional RPC (default `https://rpc.testnet.chain.robinhood.com/rpc`) |
| `VIBEVIBE_TREASURY_ADDRESS` | 0x treasury in the CrewPay fee map (falls back to `CLANKER_TREASURY_ADDRESS`) |
| `VIBEVIBE_FACTORY_ADDRESS` | Optional factory override (testnet default `0xe794217880011f9cA6961340eD5c16EC9559Fea0`) |
| `VIBEVIBE_FEE_SPLITTER_ADDRESS` | Optional — if set, used as on-chain `creatorFeeRecipient` instead of the launcher |

API: `POST /api/agent/launch/unsigned` with `platform: "vibevibe"`. MCP: `crew_build_unsigned` with the same `platform`.

Token pages: `https://testnet.vibevibe.fun/token/<address>` (mainnet: `https://vibevibe.fun/token/<address>`).

## Fee map vs on-chain (honest gap)

**CrewPay planning (unchanged):** 60% KOL crew / 15% launching agent / 25% treasury (or 60/15/5/20 with a bound KOL referral). Shareholders appear in dry-run and ops tooling.

**On-chain (run15 factory):** The observed create entrypoint (`0x24e615b3`) accepts a **single** `creatorFeeRecipient`. Curve trade taxes accrue to that address. CrewPay defaults it to the **launcher** unless `VIBEVIBE_FEE_SPLITTER_ADDRESS` is a valid 0x contract you control.

CrewPay does **not** deploy a splitter for vibe/vibe by default. The 60/15/25 map is **not** enforced on-chain unless your splitter (or a future multi-recipient launch API) implements it.

Protocol/treasury layers in Seedify contracts are separate from CrewPay’s map and are not fully wired in this rail.

## Metadata

Production vibe flows pin metadata via Seedify prepare (`/api/v1/chains/46630/metadata/prepare`). CrewPay accepts a `metadataUri` you supply from that flow; it does not call prepare on your behalf yet.

## Safety

- Use **Robinhood Chain testnet** in CI and automation.
- Set `minInitialTokensOut` from a vibe quote when attaching `initialBuyWei` — otherwise the tx may revert.
- Mint address is unknown until the create tx is mined; persist with `POST /api/agent/launch/submit` and `mint` when known.
