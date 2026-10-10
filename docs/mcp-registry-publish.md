# Official MCP Registry — publish `crewpay-mcp@1.2.2` + hosted remote

**Primary discovery channel** (with Smithery + ClawHub). Glama / awesome-mcp are skipped.

`package.json` `mcpName` must match `server.json` `name`: **`io.github.fxams/crewpay-mcp`**.

**Published 2026-10-10:** registry latest is **1.2.0** with remotes. Repo `agent/crew-mcp/server.json` matches:

Confirm anytime:
```bash
curl -sS 'https://registry.modelcontextprotocol.io/v0/servers?search=crewpay&version=1.2.0' \
  | jq '.servers[0].server | {name, version, remotes}'
```

Card includes:

- npm package `crewpay-mcp@1.2.2` (stdio) — already on npm
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

# 1) Login (prints a device code → https://github.com/login/device)
mcp-publisher login github

# 2) Publish
mcp-publisher publish ./server.json

# 3) Verify
curl -sS 'https://registry.modelcontextprotocol.io/v0/servers?search=crewpay' \
  | jq '.servers[0].server | {name, version, remotes, packages}'
```

Expected: `version` = `"1.2.0"` and `remotes[0].url` = `https://mcp.crewpay.dev/mcp`.

If you see `Invalid or expired Registry JWT token`, run `mcp-publisher login github` again.

## After Registry publish

1. Optional Smithery refresh — `docs/directory-submissions/smithery.md`
2. Close https://github.com/punkpeye/awesome-mcp-servers/pull/16008 (Glama path abandoned)
3. ClawHub already live: https://clawhub.ai/fxams/crewpay · `openclaw skills install @fxams/crewpay`
