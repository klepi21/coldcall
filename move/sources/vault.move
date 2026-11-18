/// COLD CALL vault: players deposit coins, play with in-app balances tracked off chain
/// (Postgres double-entry ledger), and cash out with a withdrawal ticket signed by the game server.
///
/// One shared `Vault<T>` per coin type (SUI and LOFI on devnet).
///
/// Withdrawal ticket (raw ed25519 over exactly these 88 bytes, no intent prefix, no hashing):
///   offset  0  32 bytes  vault object id (address bytes)
///   offset 32  32 bytes  recipient address (must equal the transaction sender)
///   offset 64   8 bytes  amount     u64 little endian (base units)
///   offset 72   8 bytes  nonce      u64 little endian (unique per vault, single use)
///   offset 80   8 bytes  expiry_ms  u64 little endian (ticket valid while clock < expiry_ms)
/// This is exactly `bcs(address) || bcs(address) || bcs(u64) || bcs(u64) || bcs(u64)`.
///
/// Abort codes (module vault, range 0+):
///   1 EPaused             vault is paused (deposit and withdraw)
///   2 EZeroAmount         amount is 0
///   3 EExpired            clock >= expiry_ms
///   4 ENonceUsed          ticket nonce already used (replay)
///   5 EBadSignature       signature does not verify for (vault, sender, amount, nonce, expiry)
///   6 EInsufficientFunds  vault balance lower than the amount
///   7 EBadPubkey          server public key is not 32 bytes
///   8 EBadSignatureLength signature is not 64 bytes
module cold_call::vault;

use cold_call::admin::AdminCap;
use std::ascii;
use std::type_name;
use sui::balance::{Self, Balance};
use sui::bcs;
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::ed25519;
use sui::event;
use sui::table::{Self, Table};

const EPaused: u64 = 1;
const EZeroAmount: u64 = 2;
const EExpired: u64 = 3;
const ENonceUsed: u64 = 4;
const EBadSignature: u64 = 5;
const EInsufficientFunds: u64 = 6;
const EBadPubkey: u64 = 7;
const EBadSignatureLength: u64 = 8;

public struct Vault<phantom T> has key {
    id: UID,
    balance: Balance<T>,
    /// Raw 32 byte ed25519 public key of the game server that signs withdrawal tickets.
    server_pubkey: vector<u8>,
    paused: bool,
    /// Used ticket nonces.
    used: Table<u64, bool>,
    /// Lifetime totals (base units) of user deposits and ticket withdrawals.
    deposits: u64,
    withdrawals: u64,
}

// === Events ===
public struct VaultCreated has copy, drop { vault: ID, coin_type: ascii::String }
public struct Deposited has copy, drop { vault: ID, coin_type: ascii::String, user: address, amount: u64 }
public struct Withdrawn has copy, drop { vault: ID, user: address, amount: u64, nonce: u64 }
public struct Funded has copy, drop { vault: ID, from: address, amount: u64 }
public struct AdminWithdrawn has copy, drop { vault: ID, to: address, amount: u64 }
public struct PausedChanged has copy, drop { vault: ID, paused: bool }
public struct ServerPubkeyChanged has copy, drop { vault: ID, server_pubkey: vector<u8> }

/// Creates and shares a vault for coin type `T`.
public fun create<T>(_: &AdminCap, server_pubkey: vector<u8>, ctx: &mut TxContext) {
    assert!(server_pubkey.length() == 32, EBadPubkey);
    let v = Vault<T> {
        id: object::new(ctx),
        balance: balance::zero(),
        server_pubkey,
        paused: false,
        used: table::new(ctx),
        deposits: 0,
        withdrawals: 0,
    };
    event::emit(VaultCreated { vault: object::id(&v), coin_type: coin_type<T>() });
    transfer::share_object(v);
}

/// User deposit. The game server credits the ledger after reading the `Deposited` event on chain.
public fun deposit<T>(v: &mut Vault<T>, coin: Coin<T>, ctx: &TxContext) {
    assert!(!v.paused, EPaused);
    let amount = coin.value();
    assert!(amount > 0, EZeroAmount);
    v.balance.join(coin.into_balance());
    v.deposits = v.deposits + amount;
    event::emit(Deposited { vault: object::id(v), coin_type: coin_type<T>(), user: ctx.sender(), amount });
}

/// Cash out with a server signed ticket. The coins go to the sender, who must be the ticket recipient.
#[allow(lint(self_transfer))]
public fun withdraw<T>(
    v: &mut Vault<T>,
    amount: u64,
    nonce: u64,
    expiry_ms: u64,
    sig: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(!v.paused, EPaused);
    assert!(amount > 0, EZeroAmount);
    assert!(clock.timestamp_ms() < expiry_ms, EExpired);
    assert!(!v.used.contains(nonce), ENonceUsed);
    assert!(sig.length() == 64, EBadSignatureLength);
    let user = ctx.sender();
    let msg = ticket_message(object::id(v), user, amount, nonce, expiry_ms);
    assert!(ed25519::ed25519_verify(&sig, &v.server_pubkey, &msg), EBadSignature);
    assert!(v.balance.value() >= amount, EInsufficientFunds);
    v.used.add(nonce, true);
    v.withdrawals = v.withdrawals + amount;
    transfer::public_transfer(coin::take(&mut v.balance, amount, ctx), user);
    event::emit(Withdrawn { vault: object::id(v), user, amount, nonce });
}

/// The exact 88 byte message the server signs (see module doc).
public fun ticket_message(vault: ID, recipient: address, amount: u64, nonce: u64, expiry_ms: u64): vector<u8> {
    let mut msg = bcs::to_bytes(&vault.to_address());
    msg.append(bcs::to_bytes(&recipient));
    msg.append(bcs::to_bytes(&amount));
    msg.append(bcs::to_bytes(&nonce));
    msg.append(bcs::to_bytes(&expiry_ms));
    msg
}

/// Anyone can add funds (house bankroll). Not counted as a user deposit.
public fun fund<T>(v: &mut Vault<T>, coin: Coin<T>, ctx: &TxContext) {
    let amount = coin.value();
    assert!(amount > 0, EZeroAmount);
    v.balance.join(coin.into_balance());
    event::emit(Funded { vault: object::id(v), from: ctx.sender(), amount });
}

// === Admin ===

public fun set_server_pubkey<T>(_: &AdminCap, v: &mut Vault<T>, server_pubkey: vector<u8>) {
    assert!(server_pubkey.length() == 32, EBadPubkey);
    v.server_pubkey = server_pubkey;
    event::emit(ServerPubkeyChanged { vault: object::id(v), server_pubkey });
}

public fun set_paused<T>(_: &AdminCap, v: &mut Vault<T>, paused: bool) {
    v.paused = paused;
    event::emit(PausedChanged { vault: object::id(v), paused });
}

/// Moves house funds or fees out of the vault. Works while paused.
public fun admin_withdraw<T>(_: &AdminCap, v: &mut Vault<T>, amount: u64, to: address, ctx: &mut TxContext) {
    assert!(amount > 0, EZeroAmount);
    assert!(v.balance.value() >= amount, EInsufficientFunds);
    transfer::public_transfer(coin::take(&mut v.balance, amount, ctx), to);
    event::emit(AdminWithdrawn { vault: object::id(v), to, amount });
}

// === Reads ===
public fun balance_value<T>(v: &Vault<T>): u64 { v.balance.value() }
public fun is_used<T>(v: &Vault<T>, nonce: u64): bool { v.used.contains(nonce) }
public fun is_paused<T>(v: &Vault<T>): bool { v.paused }
public fun server_pubkey<T>(v: &Vault<T>): vector<u8> { v.server_pubkey }
public fun total_deposits<T>(v: &Vault<T>): u64 { v.deposits }
public fun total_withdrawals<T>(v: &Vault<T>): u64 { v.withdrawals }

fun coin_type<T>(): ascii::String { type_name::with_defining_ids<T>().into_string() }
