// Adds house bankroll to the SUI vault from the cc-game wallet. Usage: node fund-sui.mjs <SUI amount>
import { Transaction, coinWithBalance } from '@mysten/sui/transactions';
import { loadEnv, loadConfig, makeClient, keypair } from './lib.mjs';
const env = loadEnv(), cfg = loadConfig(), client = makeClient(cfg.rpc), game = keypair(env.CC_GAME_KEY);
const mist = BigInt(Math.round(Number(process.argv[2] || 100) * 1e9));
const tx = new Transaction();
tx.moveCall({ target: `${cfg.packageId}::vault::fund`, typeArguments: ['0x2::sui::SUI'], arguments: [tx.object(cfg.vaults.SUI.id), coinWithBalance({ balance: mist })] });
const r = await client.signAndExecuteTransaction({ transaction: tx, signer: game, include: { effects: true } });
if (r.$kind !== 'Transaction') throw new Error(JSON.stringify(r).slice(0, 300));
await client.waitForTransaction({ digest: r.Transaction.digest });
console.log('funded', String(mist), 'MIST, digest', r.Transaction.digest);
