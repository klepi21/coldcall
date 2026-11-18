import { Keypair, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { connection, faucet, depositInstruction, verifyDeposit, signTicket, withdrawInstructions, verifyWithdraw, vaultBalanceBase, tokenBalanceBase } from '../src/chain/vault';

const user = Keypair.generate();
await faucet(user.publicKey.toBase58(), 100);
console.log('faucet ok, tokens', await tokenBalanceBase(user.publicKey.toBase58()));
const dep = await sendAndConfirmTransaction(connection, new Transaction().add(depositInstruction(user.publicKey, 25_000_000n)), [user]);
console.log('deposit verified', await verifyDeposit(dep));
const nonce = 4242n, expiry = BigInt(Math.floor(Date.now() / 1000) + 600);
const { signature } = await signTicket(user.publicKey, 10_000_000n, nonce, expiry);
const wsig = await sendAndConfirmTransaction(connection, new Transaction().add(...withdrawInstructions(user.publicKey, 10_000_000n, nonce, expiry, signature)), [user]);
console.log('withdraw verified', await verifyWithdraw(wsig, user.publicKey.toBase58(), nonce));
try { await sendAndConfirmTransaction(connection, new Transaction().add(...withdrawInstructions(user.publicKey, 10_000_000n, nonce, expiry, signature)), [user]); console.log('REPLAY WORKED (bad)'); } catch { console.log('replay rejected ok'); }
console.log('user tokens', await tokenBalanceBase(user.publicKey.toBase58()), 'vault', await vaultBalanceBase());
process.exit(0);
