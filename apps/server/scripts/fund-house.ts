/** Deposits test USDC from the admin wallet into the vault. The server credits it to the house bankroll. */
import { Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { env } from '../src/env';
import { connection, loadKeypair, faucet, depositInstruction } from '../src/chain/vault';
import { creditDeposit } from '../src/wallet';
import { migrate } from '../src/db/migrate';

const amount = Number(process.argv[2] ?? 5000);
await migrate(() => {});
const admin = loadKeypair(env.DEPLOYER_KEY);
await faucet(admin.publicKey.toBase58(), amount);
const sig = await sendAndConfirmTransaction(connection, new Transaction().add(depositInstruction(admin.publicKey, BigInt(amount) * 1_000_000n)), [admin]);
console.log('deposited', amount, 'test USDC', sig, await creditDeposit(sig));
process.exit(0);
