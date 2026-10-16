/// Global launchpad config — fee bps + pause for new launches only.
module crewpay_launchpad::config;

use sui::event;
use sui::transfer;
use crewpay_launchpad::math;
use crewpay_launchpad::migration_config;

const MAX_TRADE_FEE_BPS: u64 = 1000; // 10% hard cap
const EFeeTooHigh: u64 = 1;
const EPaused: u64 = 2;

public struct AdminCap has key, store {
    id: UID,
}

public struct LaunchpadConfig has key {
    id: UID,
    trade_fee_bps: u64,
    pause_new_launches: bool,
}

public struct ConfigCreated has copy, drop {
    trade_fee_bps: u64,
}

fun init(ctx: &mut TxContext) {
    init_launchpad(ctx);
}

fun init_launchpad(ctx: &mut TxContext) {
    let cap = AdminCap { id: object::new(ctx) };
    let cfg = LaunchpadConfig {
        id: object::new(ctx),
        trade_fee_bps: 120, // 1.2% default (Blast.fun-ish)
        pause_new_launches: false,
    };
    transfer::share_object(cfg);
    transfer::transfer(cap, ctx.sender());
    let mig = migration_config::new_cetus_migration_config(60, ctx);
    migration_config::share_cetus_migration_config(mig);
    event::emit(ConfigCreated { trade_fee_bps: 120 });
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init_launchpad(ctx);
}

public fun trade_fee_bps(cfg: &LaunchpadConfig): u64 {
    cfg.trade_fee_bps
}

public fun assert_new_launches_allowed(cfg: &LaunchpadConfig) {
    assert!(!cfg.pause_new_launches, EPaused);
}

public fun set_trade_fee_bps(_: &AdminCap, cfg: &mut LaunchpadConfig, bps: u64) {
    assert!(bps <= MAX_TRADE_FEE_BPS, EFeeTooHigh);
    cfg.trade_fee_bps = bps;
}

public fun set_pause_new_launches(_: &AdminCap, cfg: &mut LaunchpadConfig, paused: bool) {
    cfg.pause_new_launches = paused;
}

public fun max_trade_fee_bps(): u64 {
    MAX_TRADE_FEE_BPS
}
