module crewpay_launchpad::pool;

use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin, TreasuryCap};
use sui::event;
use sui::sui::SUI;
use sui::transfer;
use std::type_name::{Self, TypeName};
use crewpay_launchpad::config::{Self, LaunchpadConfig};
use crewpay_launchpad::curve;
use crewpay_launchpad::fees::{Self, FeeRecipients};
use crewpay_launchpad::math;
use crewpay_launchpad::migration;
use crewpay_launchpad::migration_config::CetusMigrationConfig;
use cetus_clmm::config::GlobalConfig;
use cetus_clmm::factory::Pools;
use sui::clock::Clock;
use sui::coin::CoinMetadata;

const BPS: u64 = 10000;
/// Real meme balance that must remain in the pool for Cetus migration LP (curve sells only the rest).
const MIGRATION_MEME_RESERVE_BPS: u64 = 2000;
const EGraduated: u64 = 1;
const ESlippage: u64 = 2;
const EBadSupply: u64 = 3;
const EZero: u64 = 4;
const ENotGraduated: u64 = 5;
const EAlreadyMigrated: u64 = 6;

public struct Pool<phantom T> has key {
    id: UID,
    /// Held so no further minting; not exposed via admin entrypoints.
    treasury_cap: TreasuryCap<T>,
    meme: Balance<T>,
    sui: Balance<SUI>,
    virtual_sui: u64,
    virtual_meme: u64,
    target_sui: u64,
    graduated: bool,
    migrated: bool,
    recipients: FeeRecipients,
    launcher: address,
    meme_type: TypeName,
}

public struct Launched has copy, drop {
    pool_id: ID,
    launcher: address,
    meme_type: TypeName,
    target_sui: u64,
}

public struct Bought has copy, drop {
    pool_id: ID,
    sui_in: u64,
    meme_out: u64,
    fee_sui: u64,
}

public struct Sold has copy, drop {
    pool_id: ID,
    meme_in: u64,
    sui_out: u64,
    fee_sui: u64,
}

public struct Graduated has copy, drop {
    pool_id: ID,
    sui_liquidity: u64,
    meme_liquidity: u64,
}

public struct FeesPaid has copy, drop {
    pool_id: ID,
    total_fee: u64,
}

fun migration_meme_reserve<T>(pool: &Pool<T>): u64 {
    let supply = coin::total_supply(&pool.treasury_cap);
    math::mul_div_floor(supply, MIGRATION_MEME_RESERVE_BPS, BPS)
}

fun max_tradable_meme(real_meme: u64, migration_reserve: u64): u64 {
    if (real_meme <= migration_reserve) {
        0
    } else {
        math::sub_u64(real_meme, migration_reserve)
    }
}

fun take_trade_fee(amount: u64, fee_bps: u64): (u64, u64) {
    let fee = math::mul_div_floor(amount, fee_bps, BPS);
    let net = math::sub_u64(amount, fee);
    (net, fee)
}

/// Entry helper for PTBs — builds FeeRecipients then opens the pool.
public fun create_pool_with_recipients<T>(
    cfg: &LaunchpadConfig,
    treasury: TreasuryCap<T>,
    supply: u64,
    virtual_sui: u64,
    virtual_meme: u64,
    target_sui: u64,
    crew: vector<address>,
    crew_weight_bps: vector<u64>,
    agent: address,
    treasury_addr: address,
    referrer: Option<address>,
    ctx: &mut TxContext,
): ID {
    let recipients = fees::new_recipients(crew, crew_weight_bps, agent, treasury_addr, referrer);
    create_pool<T>(
        cfg,
        treasury,
        supply,
        virtual_sui,
        virtual_meme,
        target_sui,
        recipients,
        ctx,
    )
}

/// Open a new bonding-curve pool. Mints `supply` meme into the pool reserve.
public fun create_pool<T>(
    cfg: &LaunchpadConfig,
    mut treasury: TreasuryCap<T>,
    supply: u64,
    virtual_sui: u64,
    virtual_meme: u64,
    target_sui: u64,
    recipients: FeeRecipients,
    ctx: &mut TxContext,
): ID {
    config::assert_new_launches_allowed(cfg);
    assert!(supply > 0, EBadSupply);
    let migration_reserve = math::mul_div_floor(supply, MIGRATION_MEME_RESERVE_BPS, BPS);
    assert!(migration_reserve > 0 && migration_reserve < supply, EBadSupply);
    let meme_bal = coin::into_balance(coin::mint(&mut treasury, supply, ctx));
    let pool = Pool<T> {
        id: object::new(ctx),
        treasury_cap: treasury,
        meme: meme_bal,
        sui: balance::zero(),
        virtual_sui,
        virtual_meme,
        target_sui,
        graduated: false,
        migrated: false,
        recipients,
        launcher: ctx.sender(),
        meme_type: type_name::with_defining_ids<T>(),
    };
    let pool_id = object::id(&pool);
    event::emit(Launched {
        pool_id,
        launcher: pool.launcher,
        meme_type: pool.meme_type,
        target_sui,
    });
    transfer::share_object(pool);
    pool_id
}

public fun buy<T>(
    pool: &mut Pool<T>,
    cfg: &LaunchpadConfig,
    payment: Coin<SUI>,
    min_meme_out: u64,
    ctx: &mut TxContext,
): Coin<T> {
    assert!(!pool.graduated, EGraduated);
    let sui_in = coin::value(&payment);
    assert!(sui_in > 0, EZero);
    let (sui_net, fee_sui) = take_trade_fee(sui_in, config::trade_fee_bps(cfg));
    let real_sui = balance::value(&pool.sui);
    let real_meme = balance::value(&pool.meme);
    let migration_reserve = migration_meme_reserve(pool);
    let max_sell = max_tradable_meme(real_meme, migration_reserve);
    let mut meme_out = curve::quote_buy(sui_net, real_sui, real_meme, pool.virtual_sui, pool.virtual_meme);
    if (meme_out > max_sell) {
        meme_out = max_sell;
    };
    assert!(meme_out >= min_meme_out, ESlippage);

    let mut pay_bal = coin::into_balance(payment);
    if (fee_sui > 0) {
        let fee_bal = balance::split(&mut pay_bal, fee_sui);
        let paid = fees::distribute_fee_sui(fee_bal, &pool.recipients, ctx);
        event::emit(FeesPaid { pool_id: object::id(pool), total_fee: paid });
    };
    balance::join(&mut pool.sui, pay_bal);

    let out_bal = balance::split(&mut pool.meme, meme_out);
    event::emit(Bought {
        pool_id: object::id(pool),
        sui_in,
        meme_out,
        fee_sui,
    });
    maybe_graduate(pool);
    coin::from_balance(out_bal, ctx)
}

public fun sell<T>(
    pool: &mut Pool<T>,
    cfg: &LaunchpadConfig,
    payment: Coin<T>,
    min_sui_out: u64,
    ctx: &mut TxContext,
): Coin<SUI> {
    assert!(!pool.graduated, EGraduated);
    let meme_in = coin::value(&payment);
    assert!(meme_in > 0, EZero);
    let real_sui = balance::value(&pool.sui);
    let real_meme = balance::value(&pool.meme);
    let mut sui_out_gross = curve::quote_sell(meme_in, real_sui, real_meme, pool.virtual_sui, pool.virtual_meme);
    if (sui_out_gross > real_sui) {
        sui_out_gross = real_sui;
    };
    let (sui_net, fee_sui) = take_trade_fee(sui_out_gross, config::trade_fee_bps(cfg));
    assert!(sui_net >= min_sui_out, ESlippage);

    let pay_bal = coin::into_balance(payment);
    balance::join(&mut pool.meme, pay_bal);

    let mut out_bal = balance::split(&mut pool.sui, sui_out_gross);
    if (fee_sui > 0) {
        let fee_bal = balance::split(&mut out_bal, fee_sui);
        let paid = fees::distribute_fee_sui(fee_bal, &pool.recipients, ctx);
        event::emit(FeesPaid { pool_id: object::id(pool), total_fee: paid });
    };

    event::emit(Sold {
        pool_id: object::id(pool),
        meme_in,
        sui_out: sui_net,
        fee_sui,
    });
    maybe_graduate(pool);
    coin::from_balance(out_bal, ctx)
}

fun maybe_graduate<T>(pool: &mut Pool<T>) {
    if (pool.graduated) return;
    let sui_liq = balance::value(&pool.sui);
    if (sui_liq < pool.target_sui) return;
    let meme_liq = balance::value(&pool.meme);
    let migration_reserve = migration_meme_reserve(pool);
    if (meme_liq < migration_reserve) return;
    pool.graduated = true;
    event::emit(Graduated {
        pool_id: object::id(pool),
        sui_liquidity: sui_liq,
        meme_liquidity: meme_liq,
    });
}

/// After graduation (same or follow-up tx), migrate reserves to Cetus CLMM and lock LP.
public fun migrate_to_cetus<T>(
    pool: &mut Pool<T>,
    mig_cfg: &CetusMigrationConfig,
    cetus_cfg: &GlobalConfig,
    cetus_pools: &mut Pools,
    metadata_t: &CoinMetadata<T>,
    metadata_sui: &CoinMetadata<SUI>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(pool.graduated, ENotGraduated);
    assert!(!pool.migrated, EAlreadyMigrated);
    let sui_amt = balance::value(&pool.sui);
    let meme_amt = balance::value(&pool.meme);
    assert!(sui_amt > 0 && meme_amt > 0, EZero);
    let sui_bal = balance::split(&mut pool.sui, sui_amt);
    let meme_bal = balance::split(&mut pool.meme, meme_amt);
    let pool_id = object::id(pool);
    let refund_treasury = fees::treasury_addr(&pool.recipients);
    migration::migrate_graduated_pool_to_cetus_with_refund<T>(
        pool_id,
        sui_bal,
        meme_bal,
        mig_cfg,
        cetus_cfg,
        cetus_pools,
        metadata_t,
        metadata_sui,
        refund_treasury,
        clock,
        ctx,
    );
    pool.migrated = true;
}

public fun is_graduated<T>(pool: &Pool<T>): bool {
    pool.graduated
}

public fun is_migrated<T>(pool: &Pool<T>): bool {
    pool.migrated
}

#[test_only]
public fun migration_meme_reserve_bps_for_testing(): u64 {
    MIGRATION_MEME_RESERVE_BPS
}

#[test_only]
public fun migration_meme_reserve_amount_for_testing<T>(pool: &Pool<T>): u64 {
    migration_meme_reserve(pool)
}

#[test_only]
public fun pool_liquidity_for_testing<T>(pool: &Pool<T>): (u64, u64) {
    (balance::value(&pool.sui), balance::value(&pool.meme))
}
