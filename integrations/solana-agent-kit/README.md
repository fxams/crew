# CrewPay × Solana Agent Kit

Use [`packages/solana-agent-kit-plugin-crewpay`](../../packages/solana-agent-kit-plugin-crewpay/).

Actions map to REST:

1. discover → `GET /api/agent`
2. autohire → `POST /api/agent/autohire`
3. dry-run → `POST /api/agent/launch/dry-run`
4. launch → `POST /api/agent/launch` (env launcher key + `humanConfirmed`)
5. wire-fees → `POST /api/agent/wire-fees`
6. crank → `POST /api/agent/crank`
7. proof → `GET /api/proof`

```bash
npx -y crewpay-mcp@1.2.0
```
