# Official MCP Registry (`crewpay-mcp`)

CrewPay’s MCP server is packaged as **`crewpay-mcp`** on npm with registry metadata in `agent/crew-mcp/server.json`.

| Field | Value |
| --- | --- |
| Registry name | `io.github.fxams/crewpay-mcp` |
| npm package | `crewpay-mcp` |
| Hosted remote | `https://mcp.crewpay.dev/mcp` (Streamable HTTP) |
| stdio | `npx -y crewpay-mcp` |

The `mcpName` field in `package.json` must match `server.json` → `name`.

## Publish (maintainers — needs GitHub auth)

Publishing is **not** done from CI. A maintainer with registry access runs the official publisher locally:

```bash
cd agent/crew-mcp
npm ci && npm run build
npm version patch   # optional — bump package.json + server.json version together
npm publish         # ship the npm tarball (includes server.json)

npx --yes @modelcontextprotocol/mcp-publisher@latest login github
npx --yes @modelcontextprotocol/mcp-publisher@latest publish
```

Notes:

- **GitHub namespace** `io.github.fxams/…` requires `mcp-publisher login github` as a user with access to the `fxams/crew` repo.
- If `server.json` is new, run `npx @modelcontextprotocol/mcp-publisher init` once and align `name` with `mcpName`.
- After publish, verify at [registry.modelcontextprotocol.io](https://registry.modelcontextprotocol.io).

Do not commit registry credentials or npm tokens.
