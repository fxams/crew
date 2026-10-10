# CrewPay × Solana Agent Kit

Actions map 1:1 to CrewPay REST:

1. `crew_claim_key` → `POST /api/agent/keys/claim`
2. `crew_autohire` → `POST /api/agent/autohire`
3. `crew_launch` → `POST /api/agent/launch` (needs launcher key)

```bash
npx -y crewpay-mcp
```

Base URL: `https://api.crewpay.dev`.
