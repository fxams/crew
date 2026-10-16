#[test_only]
module crewpay_launchpad::pool_edge_tests;

use std::option;
use sui::test_scenario::{Self as ts};
use sui::coin;
use sui::sui::SUI;
use sui::transfer;
use crewpay_launchpad::config::{Self, LaunchpadConfig, AdminCap};
use crewpay_launchpad::fees;
use crewpay_launchpad::pool::{Self, Pool};
use crewpay_launchpad::test_coin::TEST_COIN;

const LAUNCHER: address = @0x11;
const CREW1: address = @0x22;
const AGENT: address = @0x33;
const TREAS: address = @0x44;

#[test, expected_failure(abort_code = 2)]
fun buy_slippage_too_high_min_out() {
    let mut scenario = ts::begin(LAUNCHER);
    config::init_for_testing(ts::ctx(&mut scenario));
    ts::next_tx(&mut scenario, LAUNCHER);
    { crewpay_launchpad::test_coin::init_for_testing(ts::ctx(&mut scenario)); };
    ts::next_tx(&mut scenario, LAUNCHER);
    {
        let cfg = ts::take_shared<LaunchpadConfig>(&scenario);
        let cap = ts::take_from_sender<coin::TreasuryCap<TEST_COIN>>(&scenario);
        let recipients = fees::recipients_for_test(vector[CREW1], vector[10000u64], AGENT, TREAS);
        pool::create_pool(&cfg, cap, 10_000_000_000_000, 5_000_000_000, 5_000_000_000_000_000_000, 10_000_000_000_000, recipients, ts::ctx(&mut scenario));
        ts::return_shared(cfg);
    };
    ts::next_tx(&mut scenario, LAUNCHER);
    {
        let mut pool = ts::take_shared<Pool<TEST_COIN>>(&scenario);
        let cfg = ts::take_shared<LaunchpadConfig>(&scenario);
        let payment = coin::mint_for_testing<SUI>(1_000_000_000, ts::ctx(&mut scenario));
        let meme = pool::buy(&mut pool, &cfg, payment, 999_999_999_999_999_999, ts::ctx(&mut scenario));
        coin::burn_for_testing(meme);
        ts::return_shared(pool);
        ts::return_shared(cfg);
    };
    ts::end(scenario);
}

#[test, expected_failure(abort_code = 2)]
fun sell_slippage_too_high_min_out() {
    let mut scenario = ts::begin(LAUNCHER);
    config::init_for_testing(ts::ctx(&mut scenario));
    ts::next_tx(&mut scenario, LAUNCHER);
    { crewpay_launchpad::test_coin::init_for_testing(ts::ctx(&mut scenario)); };
    ts::next_tx(&mut scenario, LAUNCHER);
    {
        let cfg = ts::take_shared<LaunchpadConfig>(&scenario);
        let cap = ts::take_from_sender<coin::TreasuryCap<TEST_COIN>>(&scenario);
        let recipients = fees::recipients_for_test(vector[CREW1], vector[10000u64], AGENT, TREAS);
        pool::create_pool(&cfg, cap, 10_000_000_000_000, 5_000_000_000, 5_000_000_000_000_000_000, 10_000_000_000_000, recipients, ts::ctx(&mut scenario));
        ts::return_shared(cfg);
    };
    ts::next_tx(&mut scenario, LAUNCHER);
    {
        let mut pool = ts::take_shared<Pool<TEST_COIN>>(&scenario);
        let cfg = ts::take_shared<LaunchpadConfig>(&scenario);
        let payment = coin::mint_for_testing<SUI>(500_000_000, ts::ctx(&mut scenario));
        let meme = pool::buy(&mut pool, &cfg, payment, 0, ts::ctx(&mut scenario));
        transfer::public_transfer(meme, LAUNCHER);
        ts::return_shared(pool);
        ts::return_shared(cfg);
    };
    ts::next_tx(&mut scenario, LAUNCHER);
    {
        let mut pool = ts::take_shared<Pool<TEST_COIN>>(&scenario);
        let cfg = ts::take_shared<LaunchpadConfig>(&scenario);
        let meme_in = ts::take_from_sender<coin::Coin<TEST_COIN>>(&scenario);
        let sui_out = pool::sell(&mut pool, &cfg, meme_in, 999_999_999_999_999_999, ts::ctx(&mut scenario));
        coin::burn_for_testing(sui_out);
        ts::return_shared(pool);
        ts::return_shared(cfg);
    };
    ts::end(scenario);
}

#[test]
fun tiny_buy_succeeds() {
    let mut scenario = ts::begin(LAUNCHER);
    config::init_for_testing(ts::ctx(&mut scenario));
    ts::next_tx(&mut scenario, LAUNCHER);
    { crewpay_launchpad::test_coin::init_for_testing(ts::ctx(&mut scenario)); };
    ts::next_tx(&mut scenario, LAUNCHER);
    {
        let cfg = ts::take_shared<LaunchpadConfig>(&scenario);
        let cap = ts::take_from_sender<coin::TreasuryCap<TEST_COIN>>(&scenario);
        let recipients = fees::recipients_for_test(vector[CREW1], vector[10000u64], AGENT, TREAS);
        pool::create_pool(&cfg, cap, 10_000_000_000_000, 5_000_000_000, 5_000_000_000_000_000_000, 10_000_000_000_000, recipients, ts::ctx(&mut scenario));
        ts::return_shared(cfg);
    };
    ts::next_tx(&mut scenario, LAUNCHER);
    {
        let mut pool = ts::take_shared<Pool<TEST_COIN>>(&scenario);
        let cfg = ts::take_shared<LaunchpadConfig>(&scenario);
        let payment = coin::mint_for_testing<SUI>(1, ts::ctx(&mut scenario));
        let meme = pool::buy(&mut pool, &cfg, payment, 0, ts::ctx(&mut scenario));
        transfer::public_transfer(meme, LAUNCHER);
        ts::return_shared(pool);
        ts::return_shared(cfg);
    };
    ts::end(scenario);
}

#[test]
fun graduation_at_target_not_yet_migrated() {
    let mut scenario = ts::begin(LAUNCHER);
    config::init_for_testing(ts::ctx(&mut scenario));
    ts::next_tx(&mut scenario, LAUNCHER);
    { crewpay_launchpad::test_coin::init_for_testing(ts::ctx(&mut scenario)); };
    ts::next_tx(&mut scenario, LAUNCHER);
    {
        let cfg = ts::take_shared<LaunchpadConfig>(&scenario);
        let cap = ts::take_from_sender<coin::TreasuryCap<TEST_COIN>>(&scenario);
        let recipients = fees::recipients_for_test(vector[CREW1], vector[10000u64], AGENT, TREAS);
        pool::create_pool(&cfg, cap, 10_000_000_000_000, 5_000_000_000, 5_000_000_000_000_000_000, 1_000_000_000, recipients, ts::ctx(&mut scenario));
        ts::return_shared(cfg);
    };
    ts::next_tx(&mut scenario, LAUNCHER);
    {
        let mut pool = ts::take_shared<Pool<TEST_COIN>>(&scenario);
        let cfg = ts::take_shared<LaunchpadConfig>(&scenario);
        let payment = coin::mint_for_testing<SUI>(1_200_000_000, ts::ctx(&mut scenario));
        let meme = pool::buy(&mut pool, &cfg, payment, 0, ts::ctx(&mut scenario));
        transfer::public_transfer(meme, LAUNCHER);
        assert!(pool::is_graduated(&pool));
        assert!(!pool::is_migrated(&pool));
        ts::return_shared(pool);
        ts::return_shared(cfg);
    };
    ts::end(scenario);
}

#[test, expected_failure(abort_code = 1)]
fun post_graduation_buy_blocks() {
    let mut scenario = ts::begin(LAUNCHER);
    config::init_for_testing(ts::ctx(&mut scenario));
    ts::next_tx(&mut scenario, LAUNCHER);
    { crewpay_launchpad::test_coin::init_for_testing(ts::ctx(&mut scenario)); };
    ts::next_tx(&mut scenario, LAUNCHER);
    {
        let cfg = ts::take_shared<LaunchpadConfig>(&scenario);
        let cap = ts::take_from_sender<coin::TreasuryCap<TEST_COIN>>(&scenario);
        let recipients = fees::recipients_for_test(vector[CREW1], vector[10000u64], AGENT, TREAS);
        pool::create_pool(&cfg, cap, 10_000_000_000_000, 5_000_000_000, 5_000_000_000_000_000_000, 1_000_000_000, recipients, ts::ctx(&mut scenario));
        ts::return_shared(cfg);
    };
    ts::next_tx(&mut scenario, LAUNCHER);
    {
        let mut pool = ts::take_shared<Pool<TEST_COIN>>(&scenario);
        let cfg = ts::take_shared<LaunchpadConfig>(&scenario);
        let payment = coin::mint_for_testing<SUI>(1_200_000_000, ts::ctx(&mut scenario));
        let meme = pool::buy(&mut pool, &cfg, payment, 0, ts::ctx(&mut scenario));
        transfer::public_transfer(meme, LAUNCHER);
        ts::return_shared(pool);
        ts::return_shared(cfg);
    };
    ts::next_tx(&mut scenario, LAUNCHER);
    {
        let mut pool = ts::take_shared<Pool<TEST_COIN>>(&scenario);
        let cfg = ts::take_shared<LaunchpadConfig>(&scenario);
        let payment = coin::mint_for_testing<SUI>(1, ts::ctx(&mut scenario));
        let m = pool::buy(&mut pool, &cfg, payment, 0, ts::ctx(&mut scenario));
        coin::burn_for_testing(m);
        ts::return_shared(pool);
        ts::return_shared(cfg);
    };
    ts::end(scenario);
}

#[test, expected_failure(abort_code = 2)]
fun pause_blocks_new_pool() {
    let mut scenario = ts::begin(LAUNCHER);
    config::init_for_testing(ts::ctx(&mut scenario));
    ts::next_tx(&mut scenario, LAUNCHER);
    {
        let cap = ts::take_from_sender<AdminCap>(&scenario);
        let mut cfg = ts::take_shared<LaunchpadConfig>(&scenario);
        config::set_pause_new_launches(&cap, &mut cfg, true);
        ts::return_shared(cfg);
        ts::return_to_sender(&scenario, cap);
    };
    ts::next_tx(&mut scenario, LAUNCHER);
    { crewpay_launchpad::test_coin::init_for_testing(ts::ctx(&mut scenario)); };
    ts::next_tx(&mut scenario, LAUNCHER);
    {
        let cfg = ts::take_shared<LaunchpadConfig>(&scenario);
        let cap = ts::take_from_sender<coin::TreasuryCap<TEST_COIN>>(&scenario);
        let recipients = fees::recipients_for_test(vector[CREW1], vector[10000u64], AGENT, TREAS);
        pool::create_pool(&cfg, cap, 1_000, 5_000_000_000, 5_000_000_000_000_000_000, 1_000_000_000, recipients, ts::ctx(&mut scenario));
        ts::return_shared(cfg);
    };
    ts::end(scenario);
}

#[test, expected_failure(abort_code = 1)]
fun crew_weights_must_sum_10k() {
    fees::new_recipients(
        vector[@0x1],
        vector[5000u64],
        @0x2,
        @0x3,
        option::none(),
    );
}
