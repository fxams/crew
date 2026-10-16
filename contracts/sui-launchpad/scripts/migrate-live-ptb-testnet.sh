#!/usr/bin/env bash
# Live Cetus PTB: begin → vault → create_pool_v2 → lock Position at vault address → finish.
set -euo pipefail
export SUI_CLIENT_CONFIG="${SUI_CLIENT_CONFIG:-$HOME/.sui/sui_config/client.yaml}"

PKG="${CREWPAY_LAUNCHPAD_PUBLISHED_AT:-0x07f1fd3d2ea689e79dfad1b950554a630086f343e9e6f75d0780c28372ad266a}"
CETUS="${CETUS_CLMM_PUBLISHED_AT:-0x85e61285a10efc6602ab00df70a0c06357c384ef4c5633ecf73016df1500c704}"
ORIGIN="${CETUS_TYPE_ORIGIN:-0x0c7ae833c220aa73a3643a0d508afa4ac5d50d97312ea4584e35f9eb21b9df12}"
GC="${CETUS_SDK_GLOBAL_CONFIG_ID:-0x9774e359588ead122af1c7e7f64e14ade261cfeecdb5d0eb4a5b3b4c8ab8bd3e}"
POOLS="${CETUS_SDK_POOLS_ID:-0x50eb61dd5928cec5ea04711a2e9b72e5237e79e9fbcd2ce3d5469dc8708e0ee2}"
POOL="${BONDING_POOL_ID:?set BONDING_POOL_ID}"
MEME="${MEME_COIN_TYPE:?set MEME_COIN_TYPE}"
SUI='0x2::sui::SUI'
SUI_AMT="${SUI_RESERVE:-790400000}"
MEME_AMT="${MEME_RESERVE:-180989223542415031}"
REFUND="${CREWPAY_REFUND_TREASURY:-0x3333333333333333333333333333333333333333333333333333333333333333}"
ROOT="$(cd "$(dirname "$0")" && pwd)"
SUI_BIN="${SUI_BIN:-/tmp/sui}"

META_SUI=$(node "$ROOT/graphql-coin-metadata.mjs" '0x2::sui::SUI')
META_MEME=$(node "$ROOT/graphql-coin-metadata.mjs" "$MEME")

SQRT=$(node -e "
const meme=BigInt(process.argv[1]), sui=BigInt(process.argv[2]);
const num=sui<<128n, den=meme; const priceQ128=num/den;
let z=(priceQ128+1n)/2n,y=priceQ128; while(z<y){y=z;z=(priceQ128/z+z)/2n;}
console.log(y.toString());
" "$MEME_AMT" "$SUI_AMT")

POS_TYPE="${ORIGIN}::position::Position"

"$SUI_BIN" client ptb \
  --move-call "${CETUS}::pool_creator::full_range_tick_range" 60u32 \
  --assign ticks \
  --move-call "${PKG}::pool::begin_cetus_ptb_migration<${MEME}>" @"${POOL}" \
  --assign coins \
  --move-call "${PKG}::pool::create_cetus_lock_vault_for_ptb<${MEME}>" @"${POOL}" \
  --assign vault \
  --move-call "${CETUS}::pool_creator::create_pool_v2<${MEME},${SUI}>" @"${GC}" @"${POOLS}" 60u32 "${SQRT}u128" '"https://crewpay.dev/sui-launchpad"' ticks.0 ticks.1 coins.1 coins.0 @"${META_MEME}" @"${META_SUI}" true @"0x6" \
  --assign created \
  --move-call "${PKG}::migration_helpers::object_id<${POS_TYPE}>" created.0 \
  --assign pos_id \
  --move-call "${PKG}::pool::cetus_lock_vault_receive_address" vault \
  --assign vault_addr \
  --transfer-objects "[created.1,created.2]" @"${REFUND}" \
  --transfer-objects "[created.0]" vault_addr \
  --move-call "${PKG}::pool::finish_cetus_ptb_migration_locked_owned<${MEME}>" @"${POOL}" vault pos_id "${SQRT}u128" "${SUI_AMT}"u64 "${MEME_AMT}"u64
