# CrewPay × Solana Agent Kit

Use [`packages/solana-agent-kit-plugin-crewpay`](../../packages/solana-agent-kit-plugin-crewpay/).

Actions map to REST:

1. discover → `GET /api/agent`
2. list_kols / autohire → `GET /api/kols` or `POST /api/agent/autohire`
3. unsigned → `POST /api/agent/launch/unsigned` (`mintPubkey` required for Pump; create+lock `signTogether`)
4. sign locally with `signAllTransactions` (or one Jito bundle)
5. submit → `POST /api/agent/launch/submit`
6. custodial alternate → `POST /api/agent/launch` (env launcher key; fees locked at launch)
7. `crew_wire_fees` is repair-only for older launches or a failed lock
8. crank → `POST /api/agent/crank`
9. proof → `GET /api/proof`

```bash
npx -y crewpay-mcp@1.2.14
```
