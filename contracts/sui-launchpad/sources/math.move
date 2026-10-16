/// Overflow-safe fixed-point helpers for bonding-curve quotes.
module crewpay_launchpad::math;

const EOverflow: u64 = 1;
const EDivideByZero: u64 = 2;

/// floor(a * b / c) using u128 intermediates.
public fun mul_div_floor(a: u64, b: u64, c: u64): u64 {
    assert!(c > 0, EDivideByZero);
    let num = (a as u128) * (b as u128);
    (num / (c as u128)) as u64
}

/// ceil(a * b / c)
public fun mul_div_ceil(a: u64, b: u64, c: u64): u64 {
    assert!(c > 0, EDivideByZero);
    let num = (a as u128) * (b as u128);
    let den = c as u128;
    let q = num / den;
    let r = num % den;
    if (r > 0) {
        assert!(q < (18446744073709551615u128), EOverflow);
        (q + 1) as u64
    } else {
        q as u64
    }
}

public fun add_u64(a: u64, b: u64): u64 {
    let sum = (a as u128) + (b as u128);
    assert!(sum <= 18446744073709551615, EOverflow);
    sum as u64
}

public fun sub_u64(a: u64, b: u64): u64 {
    assert!(a >= b, EOverflow);
    a - b
}

#[test]
fun mul_div_floor_basic() {
    assert!(mul_div_floor(100, 6000, 10000) == 60);
    assert!(mul_div_floor(1, 1, 3) == 0);
}

#[test]
fun mul_div_ceil_rounds_up() {
    assert!(mul_div_ceil(1, 1, 3) == 1);
}
