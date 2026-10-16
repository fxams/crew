#[test_only]
module crewpay_launchpad::pool_reserve_tests;

use std::option;
use sui::test_scenario::{Self as ts};
use sui::coin;
use sui::sui::SUI;
use sui::transfer;
use crewpay_launchpad::config::{Self, LaunchpadConfig};
use crewpay_launchpad::fees;
use crewpay_launchpad::pool::{Self, Pool};
use crewpay_launchpad::test_coin::TEST_COIN;

const LAUNCHER: address = @0x11;
const CREW: address = @0x22;
const AGENT: address = @0x33;
const TREAS: address = @0x44;

const DEFAULT_SUPPLY: u64 = 1_000_000_000_000_000_000;
const DEFAULT_VIRTUAL_SUI: u64 = 5_000_000_000;
const DEFAULT_VIRTUAL_MEME: u64 = 5_000_000_000_000_000_000;
const DEFAULT_TARGET_SUI: u64 = 1_000_000_000_000;

fun open_default_pool(scenario: &mut ts::Scenario) {
    let cfg = ts::take_shared<LaunchpadConfig>(scenario);
    let cap = ts::take_from_sender<coin::TreasuryCap<TEST_COIN>>(scenario);
    let recipients = fees::new_recipients(
        vector[CREW],
        vector[10000u64],
        AGENT,
        TREAS,
        option::none(),
    );
    pool::create_pool(
        &cfg,
        cap,
        DEFAULT_SUPPLY,
        DEFAULT_VIRTUAL_SUI,
        DEFAULT_VIRTUAL_MEME,
        DEFAULT_TARGET_SUI,
        recipients,
        ts::ctx(scenario),
    );
    ts::return_shared(cfg);
}

#[test]
fun graduation_keeps_migration_meme_reserve_and_sui() {
    let mut scenario = ts::begin(LAUNCHER);
    config::init_for_testing(ts::ctx(&mut scenario));
    ts::next_tx(&mut scenario, LAUNCHER);
    { crewpay_launchpad::test_coin::init_for_testing(ts::ctx(&mut scenario)); };
    ts::next_tx(&mut scenario, LAUNCHER);
    { open_default_pool(&mut scenario); };

    let reserve_bps = pool::migration_meme_reserve_bps_for_testing();
    assert!(reserve_bps == 2000);

    ts::next_tx(&mut scenario, LAUNCHER);
    {
        let mut pool = ts::take_shared<Pool<TEST_COIN>>(&scenario);
        let cfg = ts::take_shared<LaunchpadConfig>(&scenario);
        let payment = coin::mint_for_testing<SUI>(2_000_000_000_000, ts::ctx(&mut scenario));
        let meme = pool::buy(&mut pool, &cfg, payment, 0, ts::ctx(&mut scenario));
        transfer::public_transfer(meme, LAUNCHER);
        assert!(pool::is_graduated(&pool));
        let reserve = pool::migration_meme_reserve_amount_for_testing(&pool);
        let (sui_liq, meme_liq) = pool::pool_liquidity_for_testing(&pool);
        assert!(sui_liq >= DEFAULT_TARGET_SUI);
        assert!(meme_liq >= reserve);
        assert!(meme_liq > 0);
        assert!(sui_liq > 0);
        ts::return_shared(pool);
        ts::return_shared(cfg);
    };
    ts::end(scenario);
}

#[test]
fun edge_large_buy_cannot_drain_below_reserve() {
    let mut scenario = ts::begin(LAUNCHER);
    config::init_for_testing(ts::ctx(&mut scenario));
    ts::next_tx(&mut scenario, LAUNCHER);
    { crewpay_launchpad::test_coin::init_for_testing(ts::ctx(&mut scenario)); };
    ts::next_tx(&mut scenario, LAUNCHER);
    { open_default_pool(&mut scenario); };

    ts::next_tx(&mut scenario, LAUNCHER);
    {
        let mut pool = ts::take_shared<Pool<TEST_COIN>>(&scenario);
        let cfg = ts::take_shared<LaunchpadConfig>(&scenario);
        let reserve = pool::migration_meme_reserve_amount_for_testing(&pool);
        let payment = coin::mint_for_testing<SUI>(50_000_000_000_000, ts::ctx(&mut scenario));
        let meme = pool::buy(&mut pool, &cfg, payment, 0, ts::ctx(&mut scenario));
        transfer::public_transfer(meme, LAUNCHER);
        let (_, meme_liq) = pool::pool_liquidity_for_testing(&pool);
        assert!(meme_liq >= reserve);
        ts::return_shared(pool);
        ts::return_shared(cfg);
    };
    ts::end(scenario);
}
