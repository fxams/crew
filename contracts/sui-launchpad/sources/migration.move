/// Graduation → Cetus CLMM (Sui testnet) with LP locked in a shared vault (no withdraw entrypoints).
module crewpay_launchpad::migration;

use cetus_clmm::config::GlobalConfig;
use cetus_clmm::factory::{Self, Pools};
use cetus_clmm::pool_creator;
use cetus_clmm::position::Position;
use cetus_clmm::tick_math;
use crewpay_launchpad::migration_config::{Self, CetusMigrationConfig};
use sui::object;
use crewpay_launchpad::migration_math;
use std::string;
use sui::balance::{Self, Balance};
use sui::clock::Clock;
use sui::coin::{Self, Coin, CoinMetadata};
use sui::event;
use sui::sui::SUI;
use sui::transfer;
use sui::dynamic_field as df;
const ENotGraduated: u64 = 1;
const EAlreadyMigrated: u64 = 2;
const EEmptyReserves: u64 = 3;

/// Cetus CLMM position NFT held permanently — liquidity cannot be removed via this package.
public struct LockedClmmPosition has key {
    id: UID,
    bonding_pool_id: ID,
    position: Position,
}

/// PTB vault: receives a Cetus `Position` via `transfer::public_receive` (cross-package `store` type).
public struct LockedClmmVault has key {
    id: UID,
    bonding_pool_id: ID,
}

public struct CetusPositionIdDfKey has copy, drop, store {}

/// Deprecated name (v16); kept for package compatibility.
public struct CetusPositionDfKey has copy, drop, store {}

/// Deprecated — PTB v1 only recorded ids; position NFT was left transferable. Kept for package compatibility.
public struct LockedClmmPositionRef has key {
    id: UID,
    bonding_pool_id: ID,
    cetus_position_id: ID,
    cetus_pool_id: ID,
}

public struct MigratedToCetus has copy, drop {
    bonding_pool_id: ID,
    locked_position_id: ID,
    sqrt_price_x64: u128,
    sui_amount: u64,
    meme_amount: u64,
}

/// Drain graduated bonding-curve reserves into a new Cetus CLMM pool (full range) and lock the LP NFT.
/// Legacy entry — Cetus dust refunds go to `ctx.sender()`. Prefer `migrate_graduated_pool_to_cetus_with_refund`.
public fun migrate_graduated_pool_to_cetus<T>(
    bonding_pool_id: ID,
    sui_bal: Balance<SUI>,
    meme_bal: Balance<T>,
    mig_cfg: &CetusMigrationConfig,
    cetus_cfg: &GlobalConfig,
    cetus_pools: &mut Pools,
    _metadata_t: &CoinMetadata<T>,
    _metadata_sui: &CoinMetadata<SUI>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    migrate_graduated_pool_to_cetus_with_refund(
        bonding_pool_id,
        sui_bal,
        meme_bal,
        mig_cfg,
        cetus_cfg,
        cetus_pools,
        _metadata_t,
        _metadata_sui,
        ctx.sender(),
        clock,
        ctx,
    );
}

/// Same as `migrate_graduated_pool_to_cetus` but refunds Cetus `create_pool_v3` dust to `refund_treasury`.
public(package) fun migrate_graduated_pool_to_cetus_with_refund<T>(
    bonding_pool_id: ID,
    sui_bal: Balance<SUI>,
    meme_bal: Balance<T>,
    mig_cfg: &CetusMigrationConfig,
    cetus_cfg: &GlobalConfig,
    cetus_pools: &mut Pools,
    _metadata_t: &CoinMetadata<T>,
    _metadata_sui: &CoinMetadata<SUI>,
    refund_treasury: address,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let sui_amt = balance::value(&sui_bal);
    let meme_amt = balance::value(&meme_bal);
    assert!(sui_amt > 0 && meme_amt > 0, EEmptyReserves);

    if (factory::is_right_order<T, SUI>()) {
        create_cetus_pool_and_lock<T, SUI>(
            bonding_pool_id,
            sui_amt,
            meme_amt,
            meme_bal,
            sui_bal,
            mig_cfg,
            cetus_cfg,
            cetus_pools,
            refund_treasury,
            clock,
            ctx,
        );
    } else {
        assert!(factory::is_right_order<SUI, T>(), EEmptyReserves);
        create_cetus_pool_and_lock<SUI, T>(
            bonding_pool_id,
            sui_amt,
            meme_amt,
            sui_bal,
            meme_bal,
            mig_cfg,
            cetus_cfg,
            cetus_pools,
            refund_treasury,
            clock,
            ctx,
        );
    }
}

fun create_cetus_pool_and_lock<CoinTypeA, CoinTypeB>(
    bonding_pool_id: ID,
    log_sui: u64,
    log_meme: u64,
    mut bal_a: Balance<CoinTypeA>,
    mut bal_b: Balance<CoinTypeB>,
    mig_cfg: &CetusMigrationConfig,
    cetus_cfg: &GlobalConfig,
    cetus_pools: &mut Pools,
    refund_treasury: address,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(factory::is_right_order<CoinTypeA, CoinTypeB>(), EEmptyReserves);
    let amount_a = balance::value(&bal_a);
    let amount_b = balance::value(&bal_b);
    let sqrt_price = migration_math::sqrt_price_x64_from_amounts(amount_a, amount_b);
    assert!(
        sqrt_price > tick_math::min_sqrt_price() && sqrt_price < tick_math::max_sqrt_price(),
        EEmptyReserves,
    );

    let tick_spacing = migration_config::tick_spacing(mig_cfg);
    let (tick_lower, tick_upper) = pool_creator::full_range_tick_range(tick_spacing);
    let url = string::utf8(b"https://crewpay.dev/sui-launchpad");

    let coin_a = coin::from_balance(bal_a, ctx);
    let coin_b = coin::from_balance(bal_b, ctx);

    let (position, leftover_a, leftover_b) = pool_creator::create_pool_v3<CoinTypeA, CoinTypeB>(
        cetus_cfg,
        cetus_pools,
        tick_spacing,
        sqrt_price,
        url,
        tick_lower,
        tick_upper,
        coin_a,
        coin_b,
        true,
        clock,
        ctx,
    );

    refund_leftover(leftover_a, refund_treasury, ctx);
    refund_leftover(leftover_b, refund_treasury, ctx);

    let locked = LockedClmmPosition {
        id: object::new(ctx),
        bonding_pool_id,
        position,
    };
    let locked_id = object::id(&locked);
    transfer::share_object(locked);

    event::emit(MigratedToCetus {
        bonding_pool_id,
        locked_position_id: locked_id,
        sqrt_price_x64: sqrt_price,
        sui_amount: log_sui,
        meme_amount: log_meme,
    });
}

fun refund_leftover<CoinType>(mut coin: Coin<CoinType>, refund_treasury: address, _ctx: &mut TxContext) {
    if (coin::value(&coin) == 0) {
        coin::destroy_zero(coin);
    } else {
        transfer::public_transfer(coin, refund_treasury);
    }
}

public fun locked_bonding_pool_id(lock: &LockedClmmPosition): ID {
    lock.bonding_pool_id
}

public(package) fun share_locked_clmm_position_ref(
    bonding_pool_id: ID,
    cetus_position_id: ID,
    cetus_pool_id: ID,
    sqrt_price_x64: u128,
    sui_amount: u64,
    meme_amount: u64,
    ctx: &mut TxContext,
): ID {
    let locked = LockedClmmPositionRef {
        id: object::new(ctx),
        bonding_pool_id,
        cetus_position_id,
        cetus_pool_id,
    };
    let locked_id = object::id(&locked);
    transfer::share_object(locked);
    event::emit(MigratedToCetus {
        bonding_pool_id,
        locked_position_id: locked_id,
        sqrt_price_x64,
        sui_amount,
        meme_amount,
    });
    locked_id
}

/// Wrap a Cetus `Position` NFT in a shared vault (PTB path — position created by live `pool_creator` in the same transaction).
#[allow(unused_function)]
public(package) fun prepare_cetus_lock_vault(bonding_pool_id: ID, ctx: &mut TxContext): LockedClmmVault {
    LockedClmmVault {
        id: object::new(ctx),
        bonding_pool_id,
    }
}

#[allow(unused_function)]
public(package) fun seal_cetus_lock_vault(
    _vault: LockedClmmVault,
    _receipt: sui::transfer::Receiving<Position>,
    _sqrt_price_x64: u128,
    _sui_amount: u64,
    _meme_amount: u64,
): ID {
    abort 0
}

public(package) fun create_shared_cetus_lock_vault(bonding_pool_id: ID, ctx: &mut TxContext): ID {
    let vault = new_cetus_lock_vault(bonding_pool_id, ctx);
    let vault_id = object::id(&vault);
    transfer::share_object(vault);
    vault_id
}

public(package) fun new_cetus_lock_vault(bonding_pool_id: ID, ctx: &mut TxContext): LockedClmmVault {
    LockedClmmVault {
        id: object::new(ctx),
        bonding_pool_id,
    }
}

public(package) fun seal_cetus_lock_vault_with_position_id(
    vault: LockedClmmVault,
    cetus_position_id: ID,
    sqrt_price_x64: u128,
    sui_amount: u64,
    meme_amount: u64,
) {
    let bonding_pool_id = vault.bonding_pool_id;
    let mut vault = vault;
    df::add(&mut vault.id, CetusPositionIdDfKey {}, cetus_position_id);
    let vault_id = object::id(&vault);
    transfer::share_object(vault);
    event::emit(MigratedToCetus {
        bonding_pool_id,
        locked_position_id: vault_id,
        sqrt_price_x64,
        sui_amount,
        meme_amount,
    });
}

public fun vault_receive_address(vault: &LockedClmmVault): address {
    object::id_address(vault)
}

public(package) fun lock_cetus_position(
    bonding_pool_id: ID,
    position: Position,
    sqrt_price_x64: u128,
    sui_amount: u64,
    meme_amount: u64,
    ctx: &mut TxContext,
): ID {
    let locked = LockedClmmPosition {
        id: object::new(ctx),
        bonding_pool_id,
        position,
    };
    let locked_id = object::id(&locked);
    transfer::share_object(locked);
    event::emit(MigratedToCetus {
        bonding_pool_id,
        locked_position_id: locked_id,
        sqrt_price_x64,
        sui_amount,
        meme_amount,
    });
    locked_id
}
