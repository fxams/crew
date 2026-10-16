/// Constant-product bonding curve with virtual liquidity (pump-style floor price).
module crewpay_launchpad::curve;

use crewpay_launchpad::math;

const EInsufficientLiquidity: u64 = 1;
const EZeroInput: u64 = 2;

/// Quote meme out for `sui_in` added to real SUI reserve (fee excluded).
public fun quote_buy(
    sui_in: u64,
    real_sui: u64,
    real_meme: u64,
    virtual_sui: u64,
    virtual_meme: u64,
): u64 {
    assert!(sui_in > 0, EZeroInput);
    let eff_sui = math::add_u64(real_sui, virtual_sui);
    let eff_meme = math::add_u64(real_meme, virtual_meme);
    let new_eff_sui = math::add_u64(eff_sui, sui_in);
    // meme_out = eff_meme - k / new_eff_sui, k = eff_sui * eff_meme
    let k = (eff_sui as u128) * (eff_meme as u128);
    let new_eff_meme = k / (new_eff_sui as u128);
    assert!(new_eff_meme <= (eff_meme as u128), EInsufficientLiquidity);
    let meme_out = (eff_meme as u128) - new_eff_meme;
    meme_out as u64
}

/// Quote SUI out for `meme_in` added to real meme reserve (fee excluded).
public fun quote_sell(
    meme_in: u64,
    real_sui: u64,
    real_meme: u64,
    virtual_sui: u64,
    virtual_meme: u64,
): u64 {
    assert!(meme_in > 0, EZeroInput);
    let eff_sui = math::add_u64(real_sui, virtual_sui);
    let eff_meme = math::add_u64(real_meme, virtual_meme);
    let new_eff_meme = math::add_u64(eff_meme, meme_in);
    let k = (eff_sui as u128) * (eff_meme as u128);
    let new_eff_sui = k / (new_eff_meme as u128);
    assert!(new_eff_sui <= (eff_sui as u128), EInsufficientLiquidity);
    let sui_out = (eff_sui as u128) - new_eff_sui;
    sui_out as u64
}

#[test]
fun buy_increases_price() {
    let out1 = quote_buy(1_000_000_000, 0, 1_000_000_000_000_000_000, 5_000_000_000, 5_000_000_000_000_000_000);
    assert!(out1 > 0);
    let out2 = quote_buy(1_000_000_000, 1_000_000_000, 1_000_000_000_000_000_000 - out1, 5_000_000_000, 5_000_000_000_000_000_000);
    assert!(out2 < out1);
}
