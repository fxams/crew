/// Cetus CLMM migration parameters (testnet defaults documented in docs).
module crewpay_launchpad::migration_config;

use sui::object;
use sui::transfer;
use cetus_clmm::pool_creator;

/// Shared migration tuning — tick spacing for new meme/SUI CLMM pools.
public struct CetusMigrationConfig has key {
    id: UID,
    tick_spacing: u32,
}

public fun tick_spacing(cfg: &CetusMigrationConfig): u32 {
    cfg.tick_spacing
}

/// Full-range tick indices for Cetus `create_pool_v3` (PTB helpers).
public fun full_range_tick_indices(cfg: &CetusMigrationConfig): (u32, u32) {
    pool_creator::full_range_tick_range(cfg.tick_spacing)
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
