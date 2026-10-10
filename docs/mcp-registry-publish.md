# Official MCP Registry — publish `crewpay-mcp@1.2.0` + hosted remote

`package.json` `mcpName` must match `server.json` `name`: **`io.github.fxams/crewpay-mcp`**.

Registry currently shows **1.1.2** without remotes. Repo `agent/crew-mcp/server.json` is ready at **1.2.0** with:

- npm package `crewpay-mcp@1.2.0` (stdio)
- remote `streamable-http` → `https://mcp.crewpay.dev/mcp`

## Commands (you run — GitHub auth)

```bash
cd agent/crew-mcp

# 1) Login (opens browser / device flow)
npx -y mcp-publisher@latest login github

# 2) Publish server card
npx -y mcp-publisher@latest publish ./server.json

# 3) Verify
curl -sS 'https://registry.modelcontextprotocol.io/v0/servers?search=crewpay' \
  | jq '.servers[0].server | {name, version, remotes, packages}'
```

Expected: `version` = `"1.2.0"` and `remotes[0].url` = `https://mcp.crewpay.dev/mcp`.

If login fails with expired JWT, re-run `login github` then `publish` again.
