/// Pure helpers for Cetus sqrt price from reserve amounts (Q64.64).
module crewpay_launchpad::migration_math;

const EZeroAmount: u64 = 1;

/// sqrt( amount_b / amount_a ) * 2^64 for CLMM initialize_price (token B per token A).
public fun sqrt_price_x64_from_amounts(amount_a: u64, amount_b: u64): u128 {
    assert!(amount_a > 0 && amount_b > 0, EZeroAmount);
    // price_q128 = (amount_b << 128) / amount_a  →  sqrt(price) * 2^64 = isqrt(price_q128)
    let num = (amount_b as u256) << 128;
    let den = amount_a as u256;
    let price_q128 = num / den;
    isqrt_u256(price_q128) as u128
}

fun isqrt_u256(x: u256): u256 {
    if (x == 0) return 0;
    let mut z = (x + 1) / 2;
    let mut y = x;
    while (z < y) {
        y = z;
        z = (x / z + z) / 2;
    };
    y
}

/// Compare defining type names lexicographically (Cetus coin type A/B order).
public fun type_name_lt<T1, T2>(): bool {
    let s1 = std::type_name::into_string(std::type_name::with_defining_ids<T1>());
    let s2 = std::type_name::into_string(std::type_name::with_defining_ids<T2>());
    let b1 = s1.into_bytes();
    let b2 = s2.into_bytes();
    let len1 = b1.length();
    let len2 = b2.length();
    let mut i = 0;
    let n = if (len1 < len2) { len1 } else { len2 };
    while (i < n) {
        let c1 = b1[i];
        let c2 = b2[i];
        if (c1 < c2) return true;
        if (c1 > c2) return false;
        i = i + 1;
    };
    len1 < len2
}

#[test]
fun sqrt_price_monotonic() {
    let p1 = sqrt_price_x64_from_amounts(1_000_000_000, 2_000_000_000);
    let p2 = sqrt_price_x64_from_amounts(1_000_000_000, 4_000_000_000);
    assert!(p2 > p1);
}

#[test]
fun coin_type_order_total_for_cetus() {
    use sui::sui::SUI;
    use crewpay_launchpad::test_coin::TEST_COIN;
    let meme_before_sui = type_name_lt<TEST_COIN, SUI>();
    let sui_before_meme = type_name_lt<SUI, TEST_COIN>();
    assert!(meme_before_sui != sui_before_meme);
}

#[test]
fun cetus_factory_agrees_test_coin_before_sui() {
    use cetus_clmm::factory;
    use sui::sui::SUI;
    use crewpay_launchpad::test_coin::TEST_COIN;
    assert!(factory::is_right_order<TEST_COIN, SUI>());
    assert!(!factory::is_right_order<SUI, TEST_COIN>());
}
