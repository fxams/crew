#!/usr/bin/env bash
# Live Cetus PTB migration (testnet): begin → SDK pool_creator::create_pool_v2 → finish.
# Requires /tmp/sui CLI and active testnet address with gas.
set -euo pipefail
export SUI_CLIENT_CONFIG="${SUI_CLIENT_CONFIG:-$HOME/.sui/sui_config/client.yaml}"

PKG="${CREWPAY_LAUNCHPAD_PUBLISHED_AT:-0x27353b5519bc5f3c9a6d543e717a2bce7f1dd66b903f727381b3d8121f431e4c}"
CETUS="${CETUS_CLMM_PUBLISHED_AT:-0x85e61285a10efc6602ab00df70a0c06357c384ef4c5633ecf73016df1500c704}"
GC="${CETUS_GLOBAL_CONFIG_ID:-0x9774e359588ead122af1c7e7f64e14ade261cfeecdb5d0eb4a5b3b4c8ab8bd3e}"
POOLS="${CETUS_POOLS_ID:-0x50eb61dd5928cec5ea04711a2e9b72e5237e79e9fbcd2ce3d5469dc8708e0ee2}"
POOL="${BONDING_POOL_ID:?set BONDING_POOL_ID}"
MEME="${MEME_COIN_TYPE:?set MEME_COIN_TYPE}"
SUI='0x2::sui::SUI'
SUI_AMT="${SUI_RESERVE:-790400000}"
MEME_AMT="${MEME_RESERVE:-180989223542415031}"
TREAS="${CREWPAY_TREASURY_ADDR:-0x3333333333333333333333333333333333333333333333333333333333333333}"
ROOT="$(cd "$(dirname "$0")" && pwd)"
SUI_BIN="${SUI_BIN:-/tmp/sui}"

META_SUI=$(node "$ROOT/graphql-coin-metadata.mjs" '0x2::sui::SUI')
META_MEME=$(node "$ROOT/graphql-coin-metadata.mjs" "$MEME")
SENDER=$("$SUI_BIN" client active-address)

# sqrt_price_x64 = isqrt((amount_b << 128) / amount_a) with A=meme, B=sui (Cetus type order).
SQRT=$(node -e "
const meme=BigInt(process.argv[1]), sui=BigInt(process.argv[2]);
const num=sui<<128n, den=meme; const priceQ128=num/den;
let z=(priceQ128+1n)/2n,y=priceQ128; while(z<y){y=z;z=(priceQ128/z+z)/2n;}
console.log(y.toString());
" "$MEME_AMT" "$SUI_AMT")

# pool_creator::full_range_tick_range(60) on live Cetus (tick_bound 443636, spacing 60).
TICK_LO=4294523716
TICK_HI=443580

"$SUI_BIN" client ptb \
  --move-call "${PKG}::pool::begin_cetus_ptb_migration<${MEME}>" @"${POOL}" \
  --assign coins \
  --move-call "${CETUS}::pool_creator::create_pool_v2<${MEME},${SUI}>" @"${GC}" @"${POOLS}" 60u32 "${SQRT}u128" '"https://crewpay.dev/sui-launchpad"' "${TICK_LO}"u32 "${TICK_HI}"u32 coins.1 coins.0 @"${META_MEME}" @"${META_SUI}" false @"0x6" \
  --assign created \
  --move-call "${CETUS}::position::pool_id" created.0 \
  --assign cetusPoolId \
  --move-call "${PKG}::migration_helpers::object_id<${CETUS}::position::Position>" created.0 \
  --assign posId \
  --transfer-objects '[created.1,created.2]' @"${SENDER}" \
  --transfer-objects '[created.0]' @"${TREAS}" \
  --move-call "${PKG}::pool::finish_cetus_ptb_migration<${MEME}>" @"${POOL}" posId cetusPoolId "${SQRT}u128" "${SUI_AMT}"u64 "${MEME_AMT}"u64
