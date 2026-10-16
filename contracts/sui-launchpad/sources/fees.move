/// On-chain CrewPay fee splits for every curve trade.
/// 60% crew (weighted across N addresses), 15% agent, 25% treasury — or 60/15/5/20 with referrer.
module crewpay_launchpad::fees;

use std::option;
use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin};
use sui::sui::SUI;
use sui::transfer;
use crewpay_launchpad::math;

const BPS: u64 = 10000;
const CREW_BPS: u64 = 6000;
const AGENT_BPS: u64 = 1500;
const TREASURY_BPS: u64 = 2500;
const REFERRER_BPS: u64 = 500;
const TREASURY_WITH_REF_BPS: u64 = 2000;

const EBadCrewWeights: u64 = 1;
const EEmptyCrew: u64 = 2;

public struct FeeRecipients has copy, drop, store {
    crew: vector<address>,
    crew_weight_bps: vector<u64>,
    agent: address,
    treasury: address,
    referrer: Option<address>,
}

public fun treasury_addr(recipients: &FeeRecipients): address {
    recipients.treasury
}

public fun new_recipients(
    crew: vector<address>,
    crew_weight_bps: vector<u64>,
    agent: address,
    treasury: address,
    referrer: Option<address>,
): FeeRecipients {
    assert!(crew.length() > 0, EEmptyCrew);
    assert!(crew.length() == crew_weight_bps.length(), EBadCrewWeights);
    let mut i = 0;
    let mut sum = 0u64;
    while (i < crew_weight_bps.length()) {
        sum = math::add_u64(sum, crew_weight_bps[i]);
        i = i + 1;
    };
    assert!(sum == BPS, EBadCrewWeights);
    FeeRecipients { crew, crew_weight_bps, agent, treasury, referrer }
}

/// Split `fee_sui` balance into per-recipient SUI coins; rounding dust stays in treasury portion.
public fun distribute_fee_sui(
    fee: Balance<SUI>,
    recipients: &FeeRecipients,
    ctx: &mut TxContext,
): u64 {
    let total = balance::value(&fee);
    if (total == 0) {
        balance::destroy_zero(fee);
        return 0
    };

    let crew_total = math::mul_div_floor(total, CREW_BPS, BPS);
    let agent_amt = math::mul_div_floor(total, AGENT_BPS, BPS);
    let referrer_amt = if (recipients.referrer.is_some()) {
        math::mul_div_floor(total, REFERRER_BPS, BPS)
    } else {
        0
    };

    let mut paid = 0u64;
    let mut fee_bal = fee;

    let mut i = 0;
    while (i < recipients.crew.length()) {
        let share = math::mul_div_floor(crew_total, recipients.crew_weight_bps[i], BPS);
        if (share > 0) {
            let c = balance::split(&mut fee_bal, share);
            transfer::public_transfer(coin::from_balance(c, ctx), recipients.crew[i]);
            paid = math::add_u64(paid, share);
        };
        i = i + 1;
    };

    if (agent_amt > 0) {
        let c = balance::split(&mut fee_bal, agent_amt);
        transfer::public_transfer(coin::from_balance(c, ctx), recipients.agent);
        paid = math::add_u64(paid, agent_amt);
    };

    if (referrer_amt > 0) {
        let ref_addr = *option::borrow(&recipients.referrer);
        let c = balance::split(&mut fee_bal, referrer_amt);
        transfer::public_transfer(coin::from_balance(c, ctx), ref_addr);
        paid = math::add_u64(paid, referrer_amt);
    };

    // Treasury receives nominal share plus all rounding dust remaining in fee_bal.
    let remaining = balance::value(&fee_bal);
    if (remaining > 0) {
        let c = balance::split(&mut fee_bal, remaining);
        transfer::public_transfer(coin::from_balance(c, ctx), recipients.treasury);
        paid = math::add_u64(paid, remaining);
    };

    balance::destroy_zero(fee_bal);
    paid
}

#[test_only]
public fun recipients_for_test(
    crew: vector<address>,
    crew_weight_bps: vector<u64>,
    agent: address,
    treasury: address,
): FeeRecipients {
    new_recipients(crew, crew_weight_bps, agent, treasury, option::none())
}
