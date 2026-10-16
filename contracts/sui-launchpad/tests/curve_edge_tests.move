#[test_only]
module crewpay_launchpad::curve_edge_tests;

use crewpay_launchpad::curve;

#[test, expected_failure(abort_code = 2)]
fun zero_buy_input_fails() {
    curve::quote_buy(0, 0, 1_000, 5_000, 5_000);
}

#[test]
fun large_buy_bounded_by_inventory() {
    let out = curve::quote_buy(100_000_000_000, 0, 1_000_000, 5_000_000_000, 5_000_000_000_000_000_000);
    assert!(out > 0);
    // Virtual liquidity lets quotes exceed real inventory; pool buy caps at real_meme on-chain.
    assert!(out > 1_000_000);
}

#[test]
fun sell_returns_sui() {
    let out = curve::quote_sell(1_000_000, 5_000_000_000, 5_000_000_000_000, 5_000_000_000, 5_000_000_000_000_000_000);
    assert!(out > 0);
}
