#[test_only]
module cold_call::lofi_tests;

use cold_call::admin::{Self, AdminCap};
use cold_call::lofi::{Self, Faucet, LOFI};
use sui::clock;
use sui::coin::Coin;
use sui::test_scenario as ts;

const ADMIN: address = @0xAD;
const ALICE: address = @0xA11CE;
const BOB: address = @0xB0B;
const ONE_LOFI: u64 = 1_000_000_000;
const SIX_HOURS: u64 = 21_600_000;

#[test]
fun init_creates_currency_and_faucet() {
    let mut s = ts::begin(ADMIN);
    lofi::init_for_testing(s.ctx());
    s.next_tx(ADMIN);
    let f = s.take_shared<Faucet>();
    assert!(lofi::amount(&f) == 1_000 * ONE_LOFI);
    assert!(lofi::cooldown_ms(&f) == SIX_HOURS);
    assert!(lofi::total_supply(&f) == 0);
    ts::return_shared(f);
    assert!(ts::has_most_recent_for_sender<sui::coin_registry::MetadataCap<LOFI>>(&s));
    s.end();
}

#[test]
fun claim_then_cooldown_then_claim_again() {
    let mut s = ts::begin(ADMIN);
    lofi::new_faucet_for_testing(s.ctx());
    let mut clock = clock::create_for_testing(s.ctx());
    clock.set_for_testing(1_000);

    s.next_tx(ALICE);
    let mut f = s.take_shared<Faucet>();
    lofi::claim(&mut f, &clock, s.ctx());
    assert!(lofi::last_claim_ms(&f, ALICE) == 1_000);
    assert!(lofi::next_claim_ms(&f, ALICE) == 1_000 + SIX_HOURS);
    ts::return_shared(f);

    // another address is independent
    s.next_tx(BOB);
    let mut f = s.take_shared<Faucet>();
    lofi::claim(&mut f, &clock, s.ctx());
    ts::return_shared(f);

    clock.set_for_testing(1_000 + SIX_HOURS);
    s.next_tx(ALICE);
    let mut f = s.take_shared<Faucet>();
    lofi::claim(&mut f, &clock, s.ctx());
    assert!(lofi::total_supply(&f) == 3_000 * ONE_LOFI);
    ts::return_shared(f);

    s.next_tx(ALICE);
    let ids = ts::ids_for_address<Coin<LOFI>>(ALICE);
    assert!(ids.length() == 2);
    let c = s.take_from_sender_by_id<Coin<LOFI>>(ids[0]);
    assert!(c.value() == 1_000 * ONE_LOFI);
    s.return_to_sender(c);
    clock.destroy_for_testing();
    s.end();
}

#[test, expected_failure(abort_code = lofi::ECooldown)]
fun claim_within_cooldown_fails() {
    let mut s = ts::begin(ADMIN);
    lofi::new_faucet_for_testing(s.ctx());
    let mut clock = clock::create_for_testing(s.ctx());
    clock.set_for_testing(1_000);
    s.next_tx(ALICE);
    let mut f = s.take_shared<Faucet>();
    lofi::claim(&mut f, &clock, s.ctx());
    clock.set_for_testing(1_000 + SIX_HOURS - 1);
    lofi::claim(&mut f, &clock, s.ctx());
    ts::return_shared(f);
    clock.destroy_for_testing();
    s.end();
}

#[test]
fun admin_config_and_mint() {
    let mut s = ts::begin(ADMIN);
    admin::init_for_testing(s.ctx());
    lofi::new_faucet_for_testing(s.ctx());
    let mut clock = clock::create_for_testing(s.ctx());
    clock.set_for_testing(1_000);
    s.next_tx(ADMIN);
    let cap = s.take_from_sender<AdminCap>();
    let mut f = s.take_shared<Faucet>();
    lofi::set_amount(&cap, &mut f, 5 * ONE_LOFI);
    lofi::set_cooldown(&cap, &mut f, 0);
    lofi::admin_mint(&cap, &mut f, 1_000_000 * ONE_LOFI, BOB, s.ctx());
    ts::return_shared(f);
    s.return_to_sender(cap);

    s.next_tx(ALICE);
    let mut f = s.take_shared<Faucet>();
    lofi::claim(&mut f, &clock, s.ctx());
    lofi::claim(&mut f, &clock, s.ctx()); // cooldown 0 allows back to back
    assert!(lofi::total_supply(&f) == 1_000_000 * ONE_LOFI + 10 * ONE_LOFI);
    ts::return_shared(f);

    s.next_tx(BOB);
    let c = s.take_from_sender<Coin<LOFI>>();
    assert!(c.value() == 1_000_000 * ONE_LOFI);
    s.return_to_sender(c);
    clock.destroy_for_testing();
    s.end();
}

#[test, expected_failure(abort_code = lofi::EZeroAmount)]
fun set_amount_zero_fails() {
    let mut s = ts::begin(ADMIN);
    let cap = admin::new_for_testing(s.ctx());
    lofi::new_faucet_for_testing(s.ctx());
    s.next_tx(ADMIN);
    let mut f = s.take_shared<Faucet>();
    lofi::set_amount(&cap, &mut f, 0);
    ts::return_shared(f);
    transfer::public_transfer(cap, ADMIN);
    s.end();
}
