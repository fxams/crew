/// Graduation hook — Cetus testnet wiring is isolated here (TODO).
module crewpay_launchpad::migration;

use sui::event;

public struct CetusMigrationPending has copy, drop {
    pool_id: ID,
    meme_type: std::ascii::String,
    sui_liquidity: u64,
    meme_liquidity: u64,
    note: vector<u8>,
}

/// Called when a pool hits its SUI graduation target.
/// Production: swap reserves into Cetus CLMM and burn LP position.
public fun graduate_to_cetus_stub(
    pool_id: ID,
    meme_type: std::ascii::String,
    _sui_liquidity: u64,
    _meme_liquidity: u64,
) {
    event::emit(CetusMigrationPending {
        pool_id,
        meme_type,
        sui_liquidity: _sui_liquidity,
        meme_liquidity: _meme_liquidity,
        note: b"TODO: wire Cetus testnet pool creation + LP burn/lock",
    });
}
