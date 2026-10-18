# Official MCP Registry — publish `crewpay-mcp@1.2.13` + hosted remote

**Primary discovery channel** (with Smithery + ClawHub). Glama / awesome-mcp are skipped.

`package.json` `mcpName` must match `server.json` `name`: **`io.github.fxams/crewpay-mcp`**.

Repo `agent/crew-mcp/server.json` targets **1.2.13**:

Confirm anytime:
```bash
curl -sS 'https://registry.modelcontextprotocol.io/v0/servers?search=crewpay&version=latest' \
  | jq '.servers[0].server | {name, version, remotes}'
```

Card includes:

- npm package `crewpay-mcp@1.2.13` (stdio)
- remote `streamable-http` → `https://mcp.crewpay.dev/mcp`

## Install the official CLI (not npm)

`npx mcp-publisher` is a **different** package. Install the binary from the MCP Registry releases:

```bash
# Linux/macOS
curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_$(uname -s | tr '[:upper:]' '[:lower:]')_$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/').tar.gz" \
  | tar xz mcp-publisher
sudo mv mcp-publisher /usr/local/bin/   # or: mv mcp-publisher ~/.local/bin/

mcp-publisher --version   # expect something like 1.8.x
```

## Publish (GitHub device auth — you run this)

```bash
cd agent/crew-mcp

# optional sanity check
mcp-publisher validate ./server.json

# auth (device flow — opens browser / prints code)
mcp-publisher login github

# publish
mcp-publisher publish ./server.json
```

After publish, confirm `version` is `1.2.13` and remotes include `https://mcp.crewpay.dev/mcp`.
