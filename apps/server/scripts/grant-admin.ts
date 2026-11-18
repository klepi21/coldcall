/**
 * Give (or take back) the admin role for one wallet.
 *   pnpm admin:grant <walletAddress>            make this account an admin
 *   pnpm admin:grant <walletAddress> --revoke   make it a normal player again
 * The account must exist, so sign in with that wallet once first. The role is read on every request,
 * so no new sign in is needed. ADMIN_WALLETS in .env keeps working as before (applied at sign in).
 */
import { pool, maybe } from '../src/db/pool';

const [address, flag] = process.argv.slice(2).filter((a) => a !== '--');
if (!address || (flag && flag !== '--revoke')) {
  console.error('Usage: pnpm admin:grant <walletAddress> [--revoke]');
  process.exit(2);
}
if (!/^0x[0-9a-f]{64}$/.test(address)) {
  console.error(`"${address}" is not a valid Sui address (0x followed by 64 hex characters).`);
  process.exit(2);
}
const role = flag === '--revoke' ? 'user' : 'admin';
const u = await maybe<{ id: string; display_name: string; role: string }>(
  pool,
  `update users set role = $2 where wallet_address = $1 and role <> 'house' returning id, display_name, role`,
  [address, role],
);
await pool.end();
if (!u) {
  console.error(`No player account for ${address}. Sign in once with that wallet, then run this again. (House accounts cannot be changed.)`);
  process.exit(1);
}
console.log(`${u.display_name} (${u.id}) is now role=${u.role}.`);
