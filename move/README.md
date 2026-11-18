# cold_call Move package (Sui devnet)

On-chain vault for COLD CALL. Players deposit coins into a shared `Vault<T>`, play with in-app balances
held in the Postgres double-entry ledger, and cash out with a withdrawal ticket signed by the game server.
**Devnet only, test money only.**

Public ids live in `../cold_call.config.json` (rewritten by `scripts/publish.sh`). Keys live in
`../.secrets/devnet.env` (mode 600, git ignored). The CLI uses its own config in `../.secrets/sui/`.

## Current deployment (devnet, published 2026-11-18)

| What | Id |
|---|---|
| package | `0x1c3c732c1bc3c6dafb9695e277473e7c0f4241147dd8510e4ae418995af0ed43` |
| AdminCap (owned by cc-admin) | `0xec8f943e2ffd48caf2aae1f561b81bb07c84675c0f926d235f65eb88ab993381` |
| UpgradeCap (owned by cc-admin) | `0x19b91fbe5bcad7865c5c5f2aebe4a8f331236309ba7516578c3d44c593d067c2` |
| LOFI Faucet (shared) | `0xe2723c6d654a7de53c4462de1c75e75d6c2314b12abd3d12948291e84e42502c` |
| LOFI Currency (shared, coin registry) | `0x4f939f42d2ece0b62c0cc0cfeaa0ec7d0f06e541b73cb70c81523a684c1d1b86` |
| LOFI MetadataCap (owned by cc-admin) | `0xdb0b0b3f5932f3fcc78065e87ef442e71a7065985c78a4e3910796eb1bc7c0fd` |
| Vault<SUI> (shared) | `0xf876736621841037e5737b6926cead1fbd08b72255c9fc0d87b003fd88a3b382` |
| Vault<LOFI> (shared) | `0xacbc8803cfbba49c71ecd72b908767e09f07e8ceae4235a5a1be4e0e1bfa6e58` |
| LOFI type | `0x1c3c732c1bc3c6dafb9695e277473e7c0f4241147dd8510e4ae418995af0ed43::lofi::LOFI` |
| cc-admin (publisher) | `0xf6329afcff87d1fd2328b0bd29bd6d1ea8821a5a197cf4bd8bdd0205a91643bc` |
| cc-game (sponsor, ticket signer, fees) | `0x697e2286204f802065e2f515df291f894fc59d1f88cd0d5a32b02fb43c1b7fd4` |
| cc-game raw ed25519 pubkey | `38a5df805ce425103a254af87d4e4ab63ca5e25996f1ffa2d704b6210f3e94da` |

House bankroll at publish: 1,000,000 LOFI and 5 SUI. These ids change after every devnet wipe: always read the config file.

RPC: `https://fullnode.devnet.sui.io:443` through `SuiGrpcClient` of `@mysten/sui` **2.39.1** (pinned).
Public fullnodes no longer serve JSON-RPC.

## Modules

### `cold_call::admin`
`public struct AdminCap has key, store` minted to the publisher in `init`.

### `cold_call::lofi` (devnet test coin)
`LOFI`, 9 decimals, symbol `LOFI`, name `LOFI (devnet test)`. Created with `sui::coin_registry::new_currency_with_otw`
(the non deprecated API). `init` sends the `Currency<LOFI>` to the registry `0xc`; publish.sh then calls
`0x2::coin_registry::finalize_registration<LOFI>(0xc, currency)` which makes it a shared object. The
`MetadataCap<LOFI>` goes to the publisher (to set an icon later). The `TreasuryCap<LOFI>` is locked inside the shared `Faucet`.

```move
public struct Faucet has key { id: UID, cap: TreasuryCap<LOFI>, amount: u64, cooldown_ms: u64, last: Table<address, u64> }

public fun claim(faucet: &mut Faucet, clock: &Clock, ctx: &mut TxContext)                       // mints `amount` (default 1,000 LOFI) to sender, once per cooldown (default 6 h)
public fun admin_mint(_: &AdminCap, faucet: &mut Faucet, amount: u64, to: address, ctx: &mut TxContext)
public fun set_amount(_: &AdminCap, faucet: &mut Faucet, amount: u64)
public fun set_cooldown(_: &AdminCap, faucet: &mut Faucet, cooldown_ms: u64)
// reads
public fun amount(faucet: &Faucet): u64
public fun cooldown_ms(faucet: &Faucet): u64
public fun total_supply(faucet: &Faucet): u64
public fun last_claim_ms(faucet: &Faucet, user: address): u64   // 0 if never
public fun next_claim_ms(faucet: &Faucet, user: address): u64   // 0 if never claimed
```

### `cold_call::vault`
```move
public struct Vault<phantom T> has key {
    id: UID, balance: Balance<T>, server_pubkey: vector<u8>, paused: bool,
    used: Table<u64, bool>, deposits: u64, withdrawals: u64,
}

public fun create<T>(_: &AdminCap, server_pubkey: vector<u8>, ctx: &mut TxContext)       // shares a new vault, pubkey must be 32 bytes
public fun deposit<T>(v: &mut Vault<T>, coin: Coin<T>, ctx: &TxContext)                   // not paused, amount > 0
public fun withdraw<T>(v: &mut Vault<T>, amount: u64, nonce: u64, expiry_ms: u64,
                       sig: vector<u8>, clock: &Clock, ctx: &mut TxContext)               // coins go to ctx.sender()
public fun fund<T>(v: &mut Vault<T>, coin: Coin<T>, ctx: &TxContext)                      // anyone, house bankroll, not a user deposit
public fun set_server_pubkey<T>(_: &AdminCap, v: &mut Vault<T>, server_pubkey: vector<u8>)
public fun set_paused<T>(_: &AdminCap, v: &mut Vault<T>, paused: bool)                    // blocks deposit and withdraw
public fun admin_withdraw<T>(_: &AdminCap, v: &mut Vault<T>, amount: u64, to: address, ctx: &mut TxContext) // house funds / fees, works while paused
public fun ticket_message(vault: ID, recipient: address, amount: u64, nonce: u64, expiry_ms: u64): vector<u8>
// reads
public fun balance_value<T>(v: &Vault<T>): u64
public fun is_used<T>(v: &Vault<T>, nonce: u64): bool
public fun is_paused<T>(v: &Vault<T>): bool
public fun server_pubkey<T>(v: &Vault<T>): vector<u8>
public fun total_deposits<T>(v: &Vault<T>): u64
public fun total_withdrawals<T>(v: &Vault<T>): u64
```

`withdraw` check order: not paused, amount > 0, `clock < expiry_ms`, nonce unused, sig is 64 bytes,
`ed25519_verify(sig, server_pubkey, msg)`, enough balance. Then marks the nonce used and transfers.

## Withdrawal ticket (exact bytes)

Raw ed25519 signature over exactly 88 bytes. **No intent prefix, no hashing.**

| offset | size | field | encoding |
|---|---|---|---|
| 0 | 32 | vault object id | address bytes |
| 32 | 32 | recipient | address bytes, must equal the tx sender |
| 64 | 8 | amount | u64 little endian, base units (9 decimals) |
| 72 | 8 | nonce | u64 little endian, single use per vault |
| 80 | 8 | expiry_ms | u64 little endian, valid while on-chain clock < expiry_ms |

That is `bcs(address) || bcs(address) || bcs(u64) || bcs(u64) || bcs(u64)`.

```js
import { bcs } from '@mysten/sui/bcs';
const Ticket = bcs.struct('Ticket', {
  vault: bcs.Address, recipient: bcs.Address, amount: bcs.u64(), nonce: bcs.u64(), expiry_ms: bcs.u64(),
});
const msg = Ticket.serialize({ vault: vaultId, recipient: userAddress, amount: 40_000_000_000n,
                               nonce: 123n, expiry_ms: BigInt(Date.now() + 10 * 60_000) }).toBytes(); // 88 bytes
const sig = await gameKeypair.sign(msg);  // Ed25519Keypair.sign = raw 64 byte signature, no intent
tx.moveCall({ target: `${packageId}::vault::withdraw`, typeArguments: [coinType],
  arguments: [tx.object(vaultId), tx.pure.u64(amount), tx.pure.u64(nonce), tx.pure.u64(expiry),
              tx.pure.vector('u8', Array.from(sig)), tx.object('0x6')] });
```

The unit tests check this layout byte for byte against a vector made with the JS SDK (`scripts/gen-vector.mjs`).
Nonces are per vault: the server should take them from a Postgres sequence (the withdrawal request id works).

## Events

| event | fields |
|---|---|
| `vault::VaultCreated` | `vault: ID, coin_type: ascii::String` |
| `vault::Deposited` | `vault: ID, coin_type: ascii::String, user: address, amount: u64` |
| `vault::Withdrawn` | `vault: ID, user: address, amount: u64, nonce: u64` |
| `vault::Funded` | `vault: ID, from: address, amount: u64` |
| `vault::AdminWithdrawn` | `vault: ID, to: address, amount: u64` |
| `vault::PausedChanged` | `vault: ID, paused: bool` |
| `vault::ServerPubkeyChanged` | `vault: ID, server_pubkey: vector<u8>` |
| `lofi::Claimed` | `user: address, amount: u64, at_ms: u64` |
| `lofi::AdminMinted` | `to: address, amount: u64` |
| `lofi::FaucetConfigChanged` | `amount: u64, cooldown_ms: u64` |

`coin_type` is the type name without `0x`, for example
`0000000000000000000000000000000000000000000000000000000000000002::sui::SUI` or `<pkg without 0x>::lofi::LOFI`.
With `include: { events: true }` the gRPC client returns `events[].json`, for example
`{"amount":"100000000000","coin_type":"...::lofi::LOFI","user":"0x41bb...","vault":"0xacbc..."}`.
Credit a deposit only after reading it from the chain: check `eventType == <pkg>::vault::Deposited`, the vault id, the amount,
and the user, and use the tx digest as the idempotency key.

## Abort codes

| module | code | name | meaning |
|---|---|---|---|
| vault | 1 | EPaused | vault paused (deposit, withdraw) |
| vault | 2 | EZeroAmount | amount is 0 |
| vault | 3 | EExpired | clock >= expiry_ms |
| vault | 4 | ENonceUsed | ticket nonce already used (replay) |
| vault | 5 | EBadSignature | signature invalid for (vault, sender, amount, nonce, expiry) |
| vault | 6 | EInsufficientFunds | vault balance lower than amount |
| vault | 7 | EBadPubkey | server pubkey not 32 bytes |
| vault | 8 | EBadSignatureLength | sig not 64 bytes |
| lofi | 100 | ECooldown | claim again before cooldown |
| lofi | 101 | EZeroAmount | `set_amount(0)` or `admin_mint(0)` |

An abort usually surfaces as an exception from `tx.build()` (dry run during resolution), not as a failed result:
`Transaction resolution failed: MoveAbort in 1st command, abort code: 100, in '0x<pkg>::lofi::claim' (instruction 44)`.
`scripts/e2e.mjs` (`expectAbort`) shows how to parse it.

## Sponsored transactions (user pays no gas)

The user is the sender, cc-game is the gas owner, both sign the same bytes, and the node gets `[userSig, sponsorSig]`.
See `buildSponsored`, `executeSponsored` and `runSponsored` in `scripts/lib.mjs`. With a wallet, the server builds
the bytes, the wallet signs them, the server adds the sponsor signature and executes. **The server must check what it sponsors**
(only calls into this package, no use of `tx.gas`).

SUI deposits by a user with 0 SUI, tested on devnet:
* Splitting the deposit from the sponsor gas coin (`tx.splitCoins(tx.gas, ...)` in a sponsored tx) is **rejected** by the
  node ("Gas object is not an owned object with owner: AddressOwner(user)"). Good: a sponsor can't be drained that way.
* **What works:** the user holds a SUI coin (e2e: cc-game sends 0.2 SUI to the user first), then a sponsored tx
  splits 0.1 SUI from the user's coin and calls `deposit`. Real users bring their own SUI the same way.

## Scripts (`scripts/`, npm, `@mysten/sui` 2.39.1)

| file | what |
|---|---|
| `publish.sh` | full redeploy: sets the devnet chain id in Move.toml, tops up cc-admin and cc-game from the faucet, runs unit tests, publishes, then `post-publish.mjs` |
| `post-publish.mjs` | finalize the LOFI currency registration, create Vault<SUI> and Vault<LOFI> with cc-game pubkey, mint 1,000,000 LOFI and fund the LOFI vault, fund the SUI vault with 5 SUI, write `../../cold_call.config.json` |
| `lib.mjs` | copyable helpers: `ticketMessage`, `signTicket`, `verifyTicket`, `addWithdraw`, `addDeposit`, sponsored tx build/execute, client |
| `e2e.mjs` | live devnet proof with a fresh 0 SUI user (see below) |
| `gen-vector.mjs` | regenerates the ed25519 vectors used by `tests/vault_tests.move` |
| `balance.mjs` | `node balance.mjs <addr> [coinType]` |

`node e2e.mjs` checks: sponsored faucet claim, cooldown rejection (lofi 100), sponsored deposit 100 LOFI and 0.1 SUI,
Deposited events read from effects, server signed withdrawal of 40 LOFI and 0.05 SUI (sponsored), replay rejected (vault 4),
expired ticket rejected (vault 3), wrong signer rejected (vault 5), pause blocks deposit (vault 1, then unpaused).

## Tests

```
cd ~/Desktop/coldcall/move && ~/.local/bin/sui-devnet move test     # 30 tests
```

## Republish after a devnet wipe

Devnet is wiped about every two weeks (next likely around **Nov 23 2026**). Keys stay valid, all object ids change.

```
cd ~/Desktop/coldcall/move/scripts
npm ci                     # first time only
./publish.sh               # faucet top up, tests, publish, setup, rewrites ../../cold_call.config.json
node e2e.mjs               # verify
```

The post-wipe path is untested so far: if publish complains about the lockfile or environment, delete
`move/Move.lock` and `move/Published.toml` and rerun. Then restart the game server so it reads the new config, and reset the devnet ledger (old deposits are gone).
Update the id table above if you want it current. If publish fails with a protocol or version error, download the
`devnet-vX` macOS arm64 release that matches devnet from github.com/MystenLabs/sui/releases to `~/.local/bin/sui-devnet`
(or set `SUI_BIN=...`). The CLI always runs with `--client.config ~/Desktop/coldcall/.secrets/sui/client.yaml`, so the
global `~/.sui` config is never touched.

## Not done / notes
* No Display objects (none needed: no NFTs). If ever needed, use Display V2 (`sui::display_registry`, registry `0xd`), V1 aborts on devnet.
* LOFI has no icon url; the admin holds the `MetadataCap<LOFI>` and can call `coin_registry::set_icon_url` later.
* The UpgradeCap is a single key (cc-admin). Fine for devnet; split it out or make it a multisig before any mainnet use.
