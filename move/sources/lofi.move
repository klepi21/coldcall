/// LOFI: a DEVNET TEST coin for the Cold Call hackathon demo. No value.
///
/// The currency is created through the coin registry (`sui::coin_registry`, the non deprecated API).
/// `init` sends the `Currency<LOFI>` to the registry (0xc); anyone then calls
/// `0x2::coin_registry::finalize_registration` once to make it a shared object (done by publish.sh).
/// The `TreasuryCap<LOFI>` lives inside the shared `Faucet`, so the supply is only ever minted by
/// `claim` (rate limited per address) or by the admin through `admin_mint`.
///
/// Abort codes (module lofi, range 100+):
///   100 ECooldown     `claim` called again before `cooldown_ms` passed for this address
///   101 EZeroAmount   `set_amount(0)` or `admin_mint(0)`
module cold_call::lofi;

use cold_call::admin::AdminCap;
use std::string;
use sui::clock::Clock;
use sui::coin::{Self, TreasuryCap};
use sui::coin_registry;
use sui::event;
use sui::table::{Self, Table};

const ECooldown: u64 = 100;
const EZeroAmount: u64 = 101;

const DECIMALS: u8 = 9;
/// 1,000 LOFI in base units (9 decimals).
const DEFAULT_AMOUNT: u64 = 1_000_000_000_000;
/// 6 hours.
const DEFAULT_COOLDOWN_MS: u64 = 6 * 60 * 60 * 1000;

public struct LOFI has drop {}

public struct Faucet has key {
    id: UID,
    cap: TreasuryCap<LOFI>,
    /// Base units minted per claim.
    amount: u64,
    /// Minimum time between two claims of the same address.
    cooldown_ms: u64,
    /// Last claim time (ms) per address.
    last: Table<address, u64>,
}

public struct Claimed has copy, drop { user: address, amount: u64, at_ms: u64 }
public struct AdminMinted has copy, drop { to: address, amount: u64 }
public struct FaucetConfigChanged has copy, drop { amount: u64, cooldown_ms: u64 }

fun init(otw: LOFI, ctx: &mut TxContext) {
    let (initializer, cap) = coin_registry::new_currency_with_otw(
        otw,
        DECIMALS,
        string::utf8(b"LOFI"),
        string::utf8(b"LOFI (devnet test)"),
        string::utf8(b"Test LOFI for the Cold Call hackathon demo on Sui devnet. No value."),
        string::utf8(b""),
        ctx,
    );
    let metadata_cap = initializer.finalize(ctx);
    transfer::public_transfer(metadata_cap, ctx.sender());
    share_faucet(cap, ctx);
}

fun share_faucet(cap: TreasuryCap<LOFI>, ctx: &mut TxContext) {
    transfer::share_object(Faucet {
        id: object::new(ctx),
        cap,
        amount: DEFAULT_AMOUNT,
        cooldown_ms: DEFAULT_COOLDOWN_MS,
        last: table::new(ctx),
    });
}

/// Mints `faucet.amount` LOFI to the sender, at most once per `cooldown_ms` per address.
#[allow(lint(self_transfer))]
public fun claim(faucet: &mut Faucet, clock: &Clock, ctx: &mut TxContext) {
    let user = ctx.sender();
    let now = clock.timestamp_ms();
    if (faucet.last.contains(user)) {
        let last = faucet.last.borrow_mut(user);
        assert!(now >= *last && now - *last >= faucet.cooldown_ms, ECooldown);
        *last = now;
    } else {
        faucet.last.add(user, now);
    };
    let amount = faucet.amount;
    transfer::public_transfer(coin::mint(&mut faucet.cap, amount, ctx), user);
    event::emit(Claimed { user, amount, at_ms: now });
}

/// Admin: mint LOFI (for example the house bankroll) to `to`.
public fun admin_mint(_: &AdminCap, faucet: &mut Faucet, amount: u64, to: address, ctx: &mut TxContext) {
    assert!(amount > 0, EZeroAmount);
    transfer::public_transfer(coin::mint(&mut faucet.cap, amount, ctx), to);
    event::emit(AdminMinted { to, amount });
}

public fun set_amount(_: &AdminCap, faucet: &mut Faucet, amount: u64) {
    assert!(amount > 0, EZeroAmount);
    faucet.amount = amount;
    event::emit(FaucetConfigChanged { amount, cooldown_ms: faucet.cooldown_ms });
}

public fun set_cooldown(_: &AdminCap, faucet: &mut Faucet, cooldown_ms: u64) {
    faucet.cooldown_ms = cooldown_ms;
    event::emit(FaucetConfigChanged { amount: faucet.amount, cooldown_ms });
}

// === Reads ===
public fun amount(faucet: &Faucet): u64 { faucet.amount }
public fun cooldown_ms(faucet: &Faucet): u64 { faucet.cooldown_ms }
public fun total_supply(faucet: &Faucet): u64 { faucet.cap.total_supply() }
/// Last claim time of `user` in ms, 0 if never claimed.
public fun last_claim_ms(faucet: &Faucet, user: address): u64 {
    if (faucet.last.contains(user)) *faucet.last.borrow(user) else 0
}
/// Earliest time (ms) `user` may claim again, 0 if now.
public fun next_claim_ms(faucet: &Faucet, user: address): u64 {
    if (faucet.last.contains(user)) *faucet.last.borrow(user) + faucet.cooldown_ms else 0
}

#[test_only]
public fun new_faucet_for_testing(ctx: &mut TxContext) {
    share_faucet(coin::create_treasury_cap_for_testing<LOFI>(ctx), ctx);
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(sui::test_utils::create_one_time_witness<LOFI>(), ctx);
}
