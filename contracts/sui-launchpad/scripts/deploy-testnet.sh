#!/usr/bin/env bash
# Publish crewpay_launchpad to Sui testnet only. Requires funded testnet gas (sui client active-address).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NETWORK="${SUI_NETWORK:-testnet}"
if [[ "${NETWORK}" == "mainnet" ]]; then
  echo "Refusing to deploy crewpay_launchpad to mainnet (testnet-only rail)." >&2
  exit 1
fi

if ! command -v sui >/dev/null 2>&1; then
  echo "Install Sui CLI (https://docs.sui.io/build/install) and ensure 'sui client' is configured for testnet." >&2
  exit 1
fi

echo "Building Move package..."
sui move build

echo "Publishing to ${NETWORK}..."
OUT="$(mktemp)"
sui client publish --gas-budget 500000000 --json | tee "$OUT"

PKG="$(jq -r '.objectChanges[] | select(.type=="published").packageId' "$OUT" | head -1)"
CONFIG="$(jq -r '.objectChanges[] | select(.objectType | test("LaunchpadConfig")) | .objectId' "$OUT" | head -1)"
ADMIN="$(jq -r '.objectChanges[] | select(.objectType | test("AdminCap")) | .objectId' "$OUT" | head -1)"

echo ""
echo "=== CrewPay launchpad testnet deploy ==="
echo "CREWPAY_LAUNCHPAD_PACKAGE_ID=${PKG}"
echo "CREWPAY_LAUNCHPAD_CONFIG_ID=${CONFIG}"
echo "AdminCap object (store securely): ${ADMIN}"
echo "Set SUI_LAUNCHPAD=crewpay on crew-api with the above ids."

rm -f "$OUT"
