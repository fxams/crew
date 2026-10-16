/// Cetus CLMM migration parameters (testnet defaults documented in docs).
module crewpay_launchpad::migration_config;

use sui::object;
use sui::transfer;

/// Shared migration tuning — tick spacing for new meme/SUI CLMM pools.
public struct CetusMigrationConfig has key {
    id: UID,
    tick_spacing: u32,
}

public fun tick_spacing(cfg: &CetusMigrationConfig): u32 {
    cfg.tick_spacing
}

public(package) fun new_cetus_migration_config(tick_spacing: u32, ctx: &mut TxContext): CetusMigrationConfig {
    CetusMigrationConfig {
        id: object::new(ctx),
        tick_spacing,
    }
}

public(package) fun share_cetus_migration_config(cfg: CetusMigrationConfig) {
    transfer::share_object(cfg);
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext): CetusMigrationConfig {
    new_cetus_migration_config(60, ctx)
}
