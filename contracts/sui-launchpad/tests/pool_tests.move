#[test_only]
module crewpay_launchpad::pool_tests;

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

#[test]
fun launch_buy_fee_and_graduate_event() {
    let mut scenario = ts::begin(LAUNCHER);
    config::init_for_testing(ts::ctx(&mut scenario));
    ts::next_tx(&mut scenario, LAUNCHER);
    {
        let ctx = ts::ctx(&mut scenario);
        crewpay_launchpad::test_coin::init_for_testing(ctx);
    };
    ts::next_tx(&mut scenario, LAUNCHER);
    {
        let cfg = ts::take_shared<LaunchpadConfig>(&scenario);
        let cap = ts::take_from_sender<coin::TreasuryCap<TEST_COIN>>(&scenario);
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
            1_000_000_000_000,
            5_000_000_000,
            5_000_000_000_000,
            1_000_000_000,
            recipients,
            ts::ctx(&mut scenario),
        );
        ts::return_shared(cfg);
    };
    ts::next_tx(&mut scenario, LAUNCHER);
    {
        let mut pool = ts::take_shared<Pool<TEST_COIN>>(&scenario);
        let cfg = ts::take_shared<LaunchpadConfig>(&scenario);
        let payment = coin::mint_for_testing<SUI>(2_000_000_000, ts::ctx(&mut scenario));
        let meme = pool::buy(&mut pool, &cfg, payment, 1, ts::ctx(&mut scenario));
        assert!(coin::value(&meme) > 0);
        transfer::public_transfer(meme, LAUNCHER);
        ts::return_shared(pool);
        ts::return_shared(cfg);
    };
    ts::end(scenario);
}
