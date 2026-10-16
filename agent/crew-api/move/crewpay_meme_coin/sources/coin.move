module crewpay_meme_coin::meme;

use sui::coin;

/// One-time witness — each publish creates a new package id and coin type.
public struct MEME has drop {}

fun init(witness: MEME, ctx: &mut TxContext) {
    let (treasury, metadata) = coin::create_currency(
        witness,
        9,
        b"MEME",
        b"CrewPay Meme",
        b"Memez.gg launch via CrewPay (update pool metadata for display).",
        option::none(),
        ctx,
    );
    transfer::public_transfer(treasury, ctx.sender());
    transfer::public_share_object(metadata);
}
