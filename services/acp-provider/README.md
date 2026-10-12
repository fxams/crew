# CrewPay ACP provider worker

Long-running [Virtuals ACP v2](https://www.npmjs.com/package/@virtuals-protocol/acp-node-v2) seller. Agents hire CrewPay through ACP jobs.

**Complete no-op unless `ACP_ENABLED=1`.** This package does not register an agent, generate keys, or touch funds.

Fee split is unchanged: **60% hired KOL crew / 15% launching agent / rest treasury.** The paying agent wallet is identity (same as the x402 path). `crewpay_launch_with_crew` stays non-custodial — deliverable is unsigned txs plus `crew_submit_signed` instructions.

## Offerings

Register these on [app.virtuals.io](https://app.virtuals.io/acp/new) (you do this; CrewPay CI does not).

```json
[
  {
    "name": "crewpay_autohire_kol_crew",
    "description": "Hire a KOL crew for an existing token via CrewPay Autohire. Deliverable is crew list JSON. Fee map 60% hired KOL crew / 15% launching agent / rest treasury.",
    "slaMinutes": 15,
    "priceUsd": 0.02,
    "requirements": {
      "type": "object",
      "required": ["mint", "platform", "budget"],
      "additionalProperties": false,
      "properties": {
        "mint": {
          "type": "string",
          "minLength": 20,
          "maxLength": 80,
          "description": "Token mint (Solana) or contract address (EVM)."
        },
        "platform": { "type": "string", "enum": ["pumpfun", "bags", "zora"] },
        "budget": {
          "description": "Campaign budget hint (number, string, or { seats, usd }). ACP job price is separate.",
          "oneOf": [
            { "type": "number", "exclusiveMinimum": 0 },
            { "type": "string" },
            {
              "type": "object",
              "properties": {
                "seats": { "type": "integer", "minimum": 1, "maximum": 20 },
                "usd": { "type": "number", "minimum": 0 }
              }
            }
          ]
        },
        "name": { "type": "string", "maxLength": 32 },
        "ticker": { "type": "string", "maxLength": 13 },
        "description": { "type": "string", "maxLength": 204 },
        "seats": { "type": "integer", "minimum": 1, "maximum": 20 },
        "optInOnly": { "type": "boolean" }
      }
    }
  },
  {
    "name": "crewpay_launch_with_crew",
    "description": "Build unsigned launch transactions (crew_build_unsigned) plus crew_submit_signed instructions. CrewPay never holds the launcher key. Fee map 60% hired KOL crew / 15% launching agent / rest treasury.",
    "slaMinutes": 30,
    "priceUsd": 0.1,
    "requirements": {
      "type": "object",
      "required": ["name", "ticker"],
      "additionalProperties": false,
      "properties": {
        "name": { "type": "string", "minLength": 2, "maxLength": 32 },
        "ticker": { "type": "string", "minLength": 2, "maxLength": 13 },
        "description": { "type": "string", "maxLength": 204 },
        "platform": { "type": "string", "enum": ["pumpfun", "bags", "zora"], "default": "pumpfun" },
        "launcherPubkey": {
          "type": "string",
          "description": "Address that will sign. Required for pumpfun/bags. Zora may use the paying ACP wallet."
        },
        "imageUrl": { "type": "string", "format": "uri" },
        "imageBase64": { "type": "string" },
        "crew": { "type": "array", "items": { "type": "object" } },
        "autoHire": { "description": "true | seats number | { seats }" },
        "seats": { "type": "integer", "minimum": 1, "maximum": 20 },
        "optInOnly": { "type": "boolean" },
        "initialBuySol": { "type": "number", "minimum": 0, "maximum": 10 },
        "twitter": { "type": "string" },
        "website": { "type": "string" },
        "mintPubkey": { "type": "string" },
        "treasuryBps": { "type": "integer", "minimum": 2000, "maximum": 3000 }
      }
    }
  }
]
```

`GET /api/platforms` includes `acp.enabled` (false unless `ACP_ENABLED=1`).

## Setup (operators)

1. Register a provider agent on the [Virtuals Service Registry](https://app.virtuals.io/acp/new). CrewPay does not register this for you.
2. On the agent page → **Signers** → **+ Add Signer**. Copy the signer key into `ACP_SIGNER_KEY`. Never commit it or paste it into chat.
3. Add the two offerings above (name + requirements JSON + prices).
4. Install crew-api deps (the worker calls `runAutohire` / `runUnsignedLaunch` directly):

```bash
npm ci --prefix agent/crew-api
cd services/acp-provider
cp .env.example .env
# set ACP_ENABLED=1 ACP_SIGNER_KEY=… ACP_CHAIN_ID=84532
npm ci
npm start
```

Env:

| Var | Default | Role |
|---|---|---|
| `ACP_ENABLED` | off | Worker connects only when `1` / `true` |
| `ACP_CHAIN_ID` | `84532` | Base Sepolia. `8453` = Base |
| `ACP_SIGNER_KEY` | — | Secret. Never logged |
| `ACP_WALLET_ADDRESS` | derived | Agent wallet if not the signer EOA |
| `ACP_PRICE_AUTOHIRE_USD` | `0.02` | `crewpay_autohire_kol_crew` |
| `ACP_PRICE_LAUNCH_USD` | `0.10` | `crewpay_launch_with_crew` |

## Lifecycle

1. Buyer sends a `requirement` message while the job is `open`.
2. Worker validates the JSON schema, then `setBudget(USDC)`.
3. On `job.funded`, it calls the internal Autohire or unsigned-build functions (same code as HTTP / x402). Paying wallet = identity.
4. Success → `submit(JSON)`. Error → `sendMessage` and **no submit**.

## Tests

```bash
npm test --prefix services/acp-provider
```

SDK is mocked. Tests do not create jobs, signers, or on-chain txs.
