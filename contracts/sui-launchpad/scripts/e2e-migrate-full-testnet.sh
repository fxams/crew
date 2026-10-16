#!/usr/bin/env bash
# Full testnet path: test-publish meme → open pool → buy → graduate → migrate (GraphQL metadata).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKG="${CREWPAY_LAUNCHPAD_PACKAGE_ID:-0x37cf5eccf86586fb10866c4a703e2098e2462aa437cb48100c04ba5ca57e3f64}"
CONFIG="${CREWPAY_LAUNCHPAD_CONFIG_ID:-0x3360244e91cdfbd66c4e7086b1f8e57659c923eb610637f0541733246282895a}"
MIG="${CREWPAY_LAUNCHPAD_MIGRATION_CONFIG_ID:-0xb34df4d72ce61698ac17d81804c9af4a8d5a36c623775dc31b59209f3464b3cd}"
CETUS_CFG=0xc6273f844b4bc258952c4e477697aa12c918c8e08106fac6b934811298c9820a
CETUS_POOLS=0x20a086e6fa0741b3ca77d033a65faf0871349b986ddbdde6fa1d85d78a5f4222
CLOCK=0x6
CREW=0x2222222222222222222222222222222222222222222222222222222222222222
TREAS=0x3333333333333333333333333333333333333333333333333333333333333333
AGENT="$(/tmp/sui client active-address)"
SUI=/tmp/sui

parse_digest_json() {
  python3 -c "
import sys,json,re
t=sys.stdin.read()
i=t.find('{')
d=json.loads(t[i:])
print(json.dumps(d))
"
}

echo "=== test-publish meme ==="
PUB_OUT=$(cd "$ROOT/../../agent/crew-api/move/crewpay_meme_coin" && $SUI client test-publish --build-env testnet --pubfile-path "/tmp/crewpay-meme-e2e-$(date +%s).toml" --gas-budget 200000000 --json 2>&1)
MEME_PKG=$(echo "$PUB_OUT" | parse_digest_json | python3 -c "import sys,json; d=json.load(sys.stdin); print([c['packageId'] for c in d['objectChanges'] if c.get('type')=='published'][0])")
CAP=$(echo "$PUB_OUT" | parse_digest_json | python3 -c "import sys,json; d=json.load(sys.stdin); print([c['objectId'] for c in d['objectChanges'] if 'TreasuryCap' in str(c)][0])")
MEME_TYPE="${MEME_PKG}::meme::MEME"
echo "meme_pkg=$MEME_PKG cap=$CAP"

echo "=== open pool (1e18 supply, 0.5 SUI target) ==="
OPEN_OUT=$($SUI client ptb \
  --make-move-vec "<address>" "[@${CREW}]" --assign crew \
  --make-move-vec "<u64>" "[10000]" --assign bps \
  --move-call "${PKG}::pool::create_pool_with_recipients<${MEME_TYPE}>" @"${CONFIG}" @"${CAP}" \
    1000000000000000000 5000000000 5000000000000000000 500000000 \
    crew bps @"${AGENT}" @"${TREAS}" none \
  --gas-budget 300000000 --json 2>&1)
POOL=$(echo "$OPEN_OUT" | parse_digest_json | python3 -c "import sys,json; d=json.load(sys.stdin); print([c['objectId'] for c in d['objectChanges'] if 'pool::Pool' in str(c)][0])")
echo "pool=$POOL"

META_SUI=$(node "$ROOT/graphql-coin-metadata.mjs" 0x2::sui::SUI 2>/dev/null || node -e "import {resolveCoinMetadataObjectId} from './graphql-coin-metadata.mjs'; console.log(await resolveCoinMetadataObjectId('0x2::sui::SUI'))" --input-type=module)
META_MEME=$(node -e "import {resolveCoinMetadataObjectId} from '$ROOT/graphql-coin-metadata.mjs'; console.log(await resolveCoinMetadataObjectId('$MEME_TYPE'))")

echo "=== buy to graduate ==="
BUY_OUT=$($SUI client ptb \
  --split-coins gas "[800000000]" --assign pay \
  --move-call "${PKG}::pool::buy<${MEME_TYPE}>" @"${POOL}" @"${CONFIG}" pay 0 \
  --assign meme_out --transfer-objects "[meme_out]" @"${AGENT}" \
  --gas-budget 400000000 --json 2>&1)
echo "$BUY_OUT" | parse_digest_json | python3 -c "import sys,json; d=json.load(sys.stdin); print('buy_digest', d['digest'])"

echo "=== migrate to Cetus ==="
MIG_OUT=$($SUI client ptb \
  --move-call "${PKG}::pool::migrate_to_cetus<${MEME_TYPE}>" @"${POOL}" @"${MIG}" @"${CETUS_CFG}" @"${CETUS_POOLS}" @"${META_MEME}" @"${META_SUI}" @"${CLOCK}" \
  --gas-budget 500000000 --json 2>&1)
echo "$MIG_OUT" | parse_digest_json | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('migrate_digest', d['digest'])
print('suiscan', 'https://suiscan.xyz/testnet/tx/'+d['digest'])
for c in d.get('objectChanges',[]):
  if c.get('type')!='created': continue
  ot=str(c.get('objectType',''))
  if 'LockedClmmPosition' in ot: print('locked_position', c['objectId'])
  if 'cetus_clmm::pool::Pool' in ot: print('cetus_pool', c['objectId'])
"
