#[test_only]
module crewpay_launchpad::test_coin;

use sui::coin;

public struct TEST_COIN has drop {}

fun init(witness: TEST_COIN, ctx: &mut TxContext) {
    let (treasury, metadata) = coin::create_currency(
        witness,
        9,
        b"TEST",
        b"TEST",
        b"",
        option::none(),
        ctx,
    );
    transfer::public_transfer(treasury, ctx.sender());
    transfer::public_share_object(metadata);
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(TEST_COIN {}, ctx);
}
