#[test_only]
module cold_call::vault_tests;

use cold_call::admin::{Self, AdminCap};
use cold_call::vault::{Self, Vault};
use cold_call::lofi::LOFI;
use sui::clock::{Self, Clock};
use sui::coin::{Self, Coin};
use sui::sui::SUI;
use sui::test_scenario::{Self as ts, Scenario};

const ADMIN: address = @0xAD;
const ALICE: address = @0xA11CE;
const BOB: address = @0xB0B;

// Vectors from scripts/gen-vector.mjs (server secret = 32 x 0x07, other = 32 x 0x09).
const SERVER_PK: vector<u8> = x"ea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c";
const OTHER_PK: vector<u8> = x"fd1724385aa0c75b64fb78cd602fa1d991fdebf76b13c58ed702eac835e9f618";
const VAULT_ID: address = @0xd726ecf6f7036ee3557cd6c7b93a49b231070e8eecada9cfa157e40e3f02e5d3;
// ticket (VAULT_ID, ALICE, 400, nonce 1, expiry 10_000)
const MSG: vector<u8> = x"d726ecf6f7036ee3557cd6c7b93a49b231070e8eecada9cfa157e40e3f02e5d300000000000000000000000000000000000000000000000000000000000a11ce900100000000000001000000000000001027000000000000";
const SIG: vector<u8> = x"552ed2ce77a6e3eeb6bd80ea987ffa4eda6f39b763fc4ac9d36d8b621a4bbdb110840f092f08f3b91a5d42ecbfdd4eb59057e1c28aad9bca65df4ec5ded72e09";
const SIG_OTHER: vector<u8> = x"505e22980e37e7aeac681a8a8677b049c1b38037fa56be58ad32bce8cf0eedbc2f23729d604957525dd0f97153e66902693407472f2ff1d2246d56ab5d14a40b";
// ticket (VAULT_ID, ALICE, 100, nonce 2, expiry 10_000)
const SIG2: vector<u8> = x"6ccaab642b2cd6ee618e06f4e7ed9230a6413f8bbf02cddb4f63b7e9a38881986c93201afb5745a4c49e0d08ee0e489a2dc426be54d1a6c602d7a9e0566ee405";

/// Creates AdminCap + a SUI vault (deterministic id VAULT_ID) funded with `bankroll`, clock at 5_000.
fun setup(bankroll: u64): (Scenario, Clock) {
    let mut s = ts::begin(ADMIN);
    admin::init_for_testing(s.ctx());
    s.next_tx(ADMIN);
    let cap = s.take_from_sender<AdminCap>();
    vault::create<SUI>(&cap, SERVER_PK, s.ctx());
    s.return_to_sender(cap);
    s.next_tx(ADMIN);
    if (bankroll > 0) {
        let mut v = s.take_shared<Vault<SUI>>();
        vault::fund(&mut v, coin::mint_for_testing<SUI>(bankroll, s.ctx()), s.ctx());
        ts::return_shared(v);
    };
    let mut clock = clock::create_for_testing(s.ctx());
    clock.set_for_testing(5_000);
    (s, clock)
}

fun finish(s: Scenario, clock: Clock) {
    clock.destroy_for_testing();
    s.end();
}

fun withdraw_as(s: &mut Scenario, clock: &Clock, who: address, amount: u64, nonce: u64, expiry: u64, sig: vector<u8>) {
    s.next_tx(who);
    let mut v = s.take_shared<Vault<SUI>>();
    vault::withdraw(&mut v, amount, nonce, expiry, sig, clock, s.ctx());
    ts::return_shared(v);
}

fun set_paused(s: &mut Scenario, paused: bool) {
    s.next_tx(ADMIN);
    let cap = s.take_from_sender<AdminCap>();
    let mut v = s.take_shared<Vault<SUI>>();
    vault::set_paused(&cap, &mut v, paused);
    ts::return_shared(v);
    s.return_to_sender(cap);
}

#[test]
fun vault_id_matches_vector() {
    let (mut s, clock) = setup(0);
    s.next_tx(ALICE);
    let v = s.take_shared<Vault<SUI>>();
    assert!(object::id(&v).to_address() == VAULT_ID);
    assert!(vault::server_pubkey(&v) == SERVER_PK);
    ts::return_shared(v);
    finish(s, clock);
}

#[test]
fun ticket_message_layout_matches_js() {
    let m = vault::ticket_message(object::id_from_address(VAULT_ID), ALICE, 400, 1, 10_000);
    assert!(m.length() == 88);
    assert!(m == MSG);
}

#[test]
fun deposit_happy() {
    let (mut s, clock) = setup(0);
    s.next_tx(ALICE);
    let mut v = s.take_shared<Vault<SUI>>();
    vault::deposit(&mut v, coin::mint_for_testing<SUI>(250, s.ctx()), s.ctx());
    vault::deposit(&mut v, coin::mint_for_testing<SUI>(50, s.ctx()), s.ctx());
    assert!(vault::balance_value(&v) == 300);
    assert!(vault::total_deposits(&v) == 300);
    ts::return_shared(v);
    let eff = s.next_tx(ALICE);
    assert!(eff.num_user_events() == 2);
    finish(s, clock);
}

#[test]
fun fund_is_not_a_deposit() {
    let (mut s, clock) = setup(1_000);
    s.next_tx(BOB);
    let v = s.take_shared<Vault<SUI>>();
    assert!(vault::balance_value(&v) == 1_000);
    assert!(vault::total_deposits(&v) == 0);
    ts::return_shared(v);
    finish(s, clock);
}

#[test, expected_failure(abort_code = vault::EZeroAmount)]
fun deposit_zero_fails() {
    let (mut s, clock) = setup(0);
    s.next_tx(ALICE);
    let mut v = s.take_shared<Vault<SUI>>();
    vault::deposit(&mut v, coin::zero<SUI>(s.ctx()), s.ctx());
    ts::return_shared(v);
    finish(s, clock);
}

#[test, expected_failure(abort_code = vault::EPaused)]
fun deposit_paused_fails() {
    let (mut s, clock) = setup(0);
    set_paused(&mut s, true);
    s.next_tx(ALICE);
    let mut v = s.take_shared<Vault<SUI>>();
    vault::deposit(&mut v, coin::mint_for_testing<SUI>(10, s.ctx()), s.ctx());
    ts::return_shared(v);
    finish(s, clock);
}

#[test]
fun withdraw_happy_path() {
    let (mut s, clock) = setup(1_000);
    withdraw_as(&mut s, &clock, ALICE, 400, 1, 10_000, SIG);
    withdraw_as(&mut s, &clock, ALICE, 100, 2, 10_000, SIG2);
    s.next_tx(ALICE);
    let v = s.take_shared<Vault<SUI>>();
    assert!(vault::balance_value(&v) == 500);
    assert!(vault::total_withdrawals(&v) == 500);
    assert!(vault::is_used(&v, 1) && vault::is_used(&v, 2) && !vault::is_used(&v, 3));
    ts::return_shared(v);
    let ids = ts::ids_for_address<Coin<SUI>>(ALICE);
    assert!(ids.length() == 2);
    let c1 = s.take_from_address_by_id<Coin<SUI>>(ALICE, ids[0]);
    let c2 = s.take_from_address_by_id<Coin<SUI>>(ALICE, ids[1]);
    assert!(c1.value() + c2.value() == 500);
    ts::return_to_address(ALICE, c1);
    ts::return_to_address(ALICE, c2);
    finish(s, clock);
}

#[test]
fun withdraw_just_before_expiry() {
    let (mut s, mut clock) = setup(1_000);
    clock.set_for_testing(9_999);
    withdraw_as(&mut s, &clock, ALICE, 400, 1, 10_000, SIG);
    finish(s, clock);
}

#[test, expected_failure(abort_code = vault::EBadSignature)]
fun withdraw_wrong_signer_fails() {
    let (mut s, clock) = setup(1_000);
    withdraw_as(&mut s, &clock, ALICE, 400, 1, 10_000, SIG_OTHER);
    finish(s, clock);
}

#[test, expected_failure(abort_code = vault::EBadSignature)]
fun withdraw_tampered_amount_fails() {
    let (mut s, clock) = setup(1_000);
    withdraw_as(&mut s, &clock, ALICE, 401, 1, 10_000, SIG);
    finish(s, clock);
}

#[test, expected_failure(abort_code = vault::EBadSignature)]
fun withdraw_tampered_nonce_fails() {
    let (mut s, clock) = setup(1_000);
    withdraw_as(&mut s, &clock, ALICE, 400, 7, 10_000, SIG);
    finish(s, clock);
}

#[test, expected_failure(abort_code = vault::EBadSignature)]
fun withdraw_tampered_expiry_fails() {
    let (mut s, clock) = setup(1_000);
    withdraw_as(&mut s, &clock, ALICE, 400, 1, 99_999, SIG);
    finish(s, clock);
}

#[test, expected_failure(abort_code = vault::EBadSignature)]
fun withdraw_wrong_recipient_fails() {
    let (mut s, clock) = setup(1_000);
    withdraw_as(&mut s, &clock, BOB, 400, 1, 10_000, SIG);
    finish(s, clock);
}

#[test, expected_failure(abort_code = vault::EBadSignature)]
fun withdraw_wrong_vault_fails() {
    let (mut s, clock) = setup(1_000);
    s.next_tx(ADMIN);
    let cap = s.take_from_sender<AdminCap>();
    vault::create<LOFI>(&cap, SERVER_PK, s.ctx());
    s.return_to_sender(cap);
    s.next_tx(ADMIN);
    let mut lv = s.take_shared<Vault<LOFI>>();
    vault::fund(&mut lv, coin::mint_for_testing<LOFI>(1_000, s.ctx()), s.ctx());
    ts::return_shared(lv);
    s.next_tx(ALICE);
    let mut lv = s.take_shared<Vault<LOFI>>();
    vault::withdraw(&mut lv, 400, 1, 10_000, SIG, &clock, s.ctx());
    ts::return_shared(lv);
    finish(s, clock);
}

#[test, expected_failure(abort_code = vault::ENonceUsed)]
fun withdraw_replay_fails() {
    let (mut s, clock) = setup(1_000);
    withdraw_as(&mut s, &clock, ALICE, 400, 1, 10_000, SIG);
    withdraw_as(&mut s, &clock, ALICE, 400, 1, 10_000, SIG);
    finish(s, clock);
}

#[test, expected_failure(abort_code = vault::EExpired)]
fun withdraw_expired_fails() {
    let (mut s, mut clock) = setup(1_000);
    clock.set_for_testing(10_000);
    withdraw_as(&mut s, &clock, ALICE, 400, 1, 10_000, SIG);
    finish(s, clock);
}

#[test, expected_failure(abort_code = vault::EPaused)]
fun withdraw_paused_fails() {
    let (mut s, clock) = setup(1_000);
    set_paused(&mut s, true);
    withdraw_as(&mut s, &clock, ALICE, 400, 1, 10_000, SIG);
    finish(s, clock);
}

#[test]
fun unpause_restores_withdraw() {
    let (mut s, clock) = setup(1_000);
    set_paused(&mut s, true);
    set_paused(&mut s, false);
    withdraw_as(&mut s, &clock, ALICE, 400, 1, 10_000, SIG);
    finish(s, clock);
}

#[test, expected_failure(abort_code = vault::EInsufficientFunds)]
fun withdraw_insufficient_funds_fails() {
    let (mut s, clock) = setup(300);
    withdraw_as(&mut s, &clock, ALICE, 400, 1, 10_000, SIG);
    finish(s, clock);
}

#[test, expected_failure(abort_code = vault::EBadSignatureLength)]
fun withdraw_bad_sig_length_fails() {
    let (mut s, clock) = setup(1_000);
    withdraw_as(&mut s, &clock, ALICE, 400, 1, 10_000, x"00");
    finish(s, clock);
}

#[test]
fun rotated_server_key_is_used() {
    let (mut s, clock) = setup(1_000);
    s.next_tx(ADMIN);
    let cap = s.take_from_sender<AdminCap>();
    let mut v = s.take_shared<Vault<SUI>>();
    vault::set_server_pubkey(&cap, &mut v, OTHER_PK);
    ts::return_shared(v);
    s.return_to_sender(cap);
    withdraw_as(&mut s, &clock, ALICE, 400, 1, 10_000, SIG_OTHER);
    finish(s, clock);
}

#[test, expected_failure(abort_code = vault::EBadSignature)]
fun rotated_server_key_rejects_old() {
    let (mut s, clock) = setup(1_000);
    s.next_tx(ADMIN);
    let cap = s.take_from_sender<AdminCap>();
    let mut v = s.take_shared<Vault<SUI>>();
    vault::set_server_pubkey(&cap, &mut v, OTHER_PK);
    ts::return_shared(v);
    s.return_to_sender(cap);
    withdraw_as(&mut s, &clock, ALICE, 400, 1, 10_000, SIG);
    finish(s, clock);
}

#[test, expected_failure(abort_code = vault::EBadPubkey)]
fun create_bad_pubkey_fails() {
    let mut s = ts::begin(ADMIN);
    let cap = admin::new_for_testing(s.ctx());
    vault::create<SUI>(&cap, x"0102", s.ctx());
    transfer::public_transfer(cap, ADMIN);
    s.end();
}

#[test]
fun admin_withdraw_moves_house_funds_even_when_paused() {
    let (mut s, clock) = setup(1_000);
    set_paused(&mut s, true);
    s.next_tx(ADMIN);
    let cap = s.take_from_sender<AdminCap>();
    let mut v = s.take_shared<Vault<SUI>>();
    vault::admin_withdraw(&cap, &mut v, 600, BOB, s.ctx());
    assert!(vault::balance_value(&v) == 400);
    ts::return_shared(v);
    s.return_to_sender(cap);
    s.next_tx(BOB);
    let c = s.take_from_sender<Coin<SUI>>();
    assert!(c.value() == 600);
    s.return_to_sender(c);
    finish(s, clock);
}

#[test, expected_failure(abort_code = vault::EInsufficientFunds)]
fun admin_withdraw_too_much_fails() {
    let (mut s, clock) = setup(1_000);
    s.next_tx(ADMIN);
    let cap = s.take_from_sender<AdminCap>();
    let mut v = s.take_shared<Vault<SUI>>();
    vault::admin_withdraw(&cap, &mut v, 1_001, BOB, s.ctx());
    ts::return_shared(v);
    s.return_to_sender(cap);
    finish(s, clock);
}
