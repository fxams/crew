#[test_only]
module crewpay_launchpad::fees_tests;

use sui::test_scenario::{Self as ts, Scenario};
use sui::sui::SUI;
use sui::coin;
use crewpay_launchpad::fees;

const CREW1: address = @0xA1;
const CREW2: address = @0xA2;
const AGENT: address = @0xB1;
const TREAS: address = @0xC1;
const REF: address = @0xD1;

#[test]
fun split_60_15_25_dust_to_treasury() {
    let mut scenario = ts::begin(@0xAD);
    let recipients = fees::recipients_for_test(
        vector[CREW1, CREW2],
        vector[7000u64, 3000u64],
        AGENT,
        TREAS,
    );
    ts::next_tx(&mut scenario, @0xAD);
    {
        let ctx = ts::ctx(&mut scenario);
        let fee_coin = coin::mint_for_testing<SUI>(10_000, ctx);
        let fee_bal = coin::into_balance(fee_coin);
        let paid = fees::distribute_fee_sui(fee_bal, &recipients, ctx);
        assert!(paid == 10_000);
    };
    ts::next_tx(&mut scenario, CREW1);
    {
        let c = ts::take_from_sender<coin::Coin<SUI>>(&scenario);
        // 60% of 10000 = 6000, crew1 70% = 4200
        assert!(coin::value(&c) == 4200);
        ts::return_to_sender(&scenario, c);
    };
    ts::next_tx(&mut scenario, CREW2);
    {
        let c = ts::take_from_sender<coin::Coin<SUI>>(&scenario);
        assert!(coin::value(&c) == 1800);
        ts::return_to_sender(&scenario, c);
    };
    ts::next_tx(&mut scenario, AGENT);
    {
        let c = ts::take_from_sender<coin::Coin<SUI>>(&scenario);
        assert!(coin::value(&c) == 1500);
        ts::return_to_sender(&scenario, c);
    };
    ts::next_tx(&mut scenario, TREAS);
    {
        let c = ts::take_from_sender<coin::Coin<SUI>>(&scenario);
        // treasury 25% = 2500 (includes any rounding dust)
        assert!(coin::value(&c) == 2500);
        ts::return_to_sender(&scenario, c);
    };
    ts::end(scenario);
}

#[test]
fun split_60_15_5_20_with_referrer() {
    let mut scenario = ts::begin(@0xAD);
    let recipients = fees::new_recipients(
        vector[CREW1],
        vector[10000u64],
        AGENT,
        TREAS,
        std::option::some(REF),
    );
    ts::next_tx(&mut scenario, @0xAD);
    {
        let ctx = ts::ctx(&mut scenario);
        let fee_coin = coin::mint_for_testing<SUI>(10_000, ctx);
        let fee_bal = coin::into_balance(fee_coin);
        let paid = fees::distribute_fee_sui(fee_bal, &recipients, ctx);
        assert!(paid == 10_000);
    };
    ts::next_tx(&mut scenario, CREW1);
    {
        let c = ts::take_from_sender<coin::Coin<SUI>>(&scenario);
        assert!(coin::value(&c) == 6000);
        ts::return_to_sender(&scenario, c);
    };
    ts::next_tx(&mut scenario, AGENT);
    {
        let c = ts::take_from_sender<coin::Coin<SUI>>(&scenario);
        assert!(coin::value(&c) == 1500);
        ts::return_to_sender(&scenario, c);
    };
    ts::next_tx(&mut scenario, REF);
    {
        let c = ts::take_from_sender<coin::Coin<SUI>>(&scenario);
        assert!(coin::value(&c) == 500);
        ts::return_to_sender(&scenario, c);
    };
    ts::next_tx(&mut scenario, TREAS);
    {
        let c = ts::take_from_sender<coin::Coin<SUI>>(&scenario);
        assert!(coin::value(&c) == 2000);
        ts::return_to_sender(&scenario, c);
    };
    ts::end(scenario);
}
