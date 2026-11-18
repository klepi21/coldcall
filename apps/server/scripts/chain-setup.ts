/**
 * One time chain setup for a cluster (localnet or devnet):
 *  1. creates the test USDC mint (6 decimals, authority = keys/mint-authority.json)
 *  2. initializes the vault config with the server ticket signer and a daily limit
 *  3. writes keys/chain.json for the server and the web app
 * Safe to re-run: skips steps that already exist.
 */
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { PublicKey, SystemProgram, Transaction, TransactionInstruction, LAMPORTS_PER_SOL, sendAndConfirmTransaction } from '@solana/web3.js';
import { createMint, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { env } from '../src/env';
import { connection, loadKeypair, PROGRAM_ID, configPda, vaultPda, disc } from '../src/chain/vault';

async function main() {
  const deployer = loadKeypair(env.DEPLOYER_KEY);
  const mintAuth = loadKeypair(env.MINT_AUTHORITY_KEY);
  const server = loadKeypair(env.SERVER_SIGNER_KEY);
  console.log('cluster', env.SOLANA_CLUSTER, env.SOLANA_RPC);
  console.log('deployer', deployer.publicKey.toBase58());

  if (env.SOLANA_CLUSTER === 'localnet' && (await connection.getBalance(deployer.publicKey)) < 10 * LAMPORTS_PER_SOL) {
    const s = await connection.requestAirdrop(deployer.publicKey, 100 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(s, 'confirmed');
  }
  const prog = await connection.getAccountInfo(PROGRAM_ID);
  if (!prog?.executable) throw new Error(`Program ${PROGRAM_ID.toBase58()} is not deployed on ${env.SOLANA_RPC}`);

  const existing = existsSync(env.CHAIN_CONFIG) ? JSON.parse(readFileSync(env.CHAIN_CONFIG, 'utf8')) : null;
  let mint: PublicKey;
  if (existing?.mint && existing.cluster === env.SOLANA_CLUSTER && (await connection.getAccountInfo(new PublicKey(existing.mint)))) {
    mint = new PublicKey(existing.mint);
    console.log('mint exists', mint.toBase58());
  } else {
    mint = await createMint(connection, deployer, mintAuth.publicKey, null, 6);
    console.log('created test USDC mint', mint.toBase58());
  }

  const config = configPda();
  if (!(await connection.getAccountInfo(config))) {
    const dailyLimit = 50_000n * 1_000_000n; // 50k test USDC per day across the vault
    const data = Buffer.concat([disc('initialize'), server.publicKey.toBuffer(), Buffer.from(new BigUint64Array([dailyLimit]).buffer)]);
    const ix = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: deployer.publicKey, isSigner: true, isWritable: true },
        { pubkey: config, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: vaultPda(), isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });
    const sig = await sendAndConfirmTransaction(connection, new Transaction().add(ix), [deployer]);
    console.log('vault initialized', sig);
  } else {
    console.log('vault config exists', config.toBase58());
  }

  const out = {
    cluster: env.SOLANA_CLUSTER,
    rpc: env.SOLANA_RPC,
    programId: PROGRAM_ID.toBase58(),
    mint: mint.toBase58(),
    config: config.toBase58(),
    vault: vaultPda().toBase58(),
    serverSigner: server.publicKey.toBase58(),
    admin: deployer.publicKey.toBase58(),
  };
  writeFileSync(env.CHAIN_CONFIG, JSON.stringify(out, null, 2));
  console.log(out);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
