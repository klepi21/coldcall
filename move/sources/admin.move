/// COLD CALL admin capability. One `AdminCap` is minted to the publisher in `init`.
/// It gates vault creation, pausing, server key rotation, house withdrawals and the LOFI faucet settings.
module cold_call::admin;

public struct AdminCap has key, store { id: UID }

fun init(ctx: &mut TxContext) {
    transfer::public_transfer(AdminCap { id: object::new(ctx) }, ctx.sender());
}

#[test_only]
public fun new_for_testing(ctx: &mut TxContext): AdminCap { AdminCap { id: object::new(ctx) } }

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) { init(ctx) }
