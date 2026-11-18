// Runs after `sui client publish --json`: registers the LOFI currency, creates both vaults,
// mints and funds the house bankrolls, and writes ../../cold_call.config.json (public, no secrets).
// Usage: node post-publish.mjs <publish-output.json>
import { readFileSync, writeFileSync } from 'node:fs';
import { Transaction, coinWithBalance } from '@mysten/sui/transactions';
import { loadEnv, makeClient, keypair, run, created, CONFIG, DEFAULT_RPC } from './lib.mjs';

const LOFI_BANKROLL = 1_000_000n * 10n ** 9n; // 1,000,000 LOFI
const SUI_BANKROLL = BigInt(process.env.SUI_BANKROLL_MIST ?? 5_000_000_000); // 5 SUI

const pub = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (pub.effects?.status?.status && pub.effects.status.status !== 'success') throw new Error('publish failed: ' + JSON.stringify(pub.effects.status));
const env = loadEnv();
const rpc = env.SUI_RPC || DEFAULT_RPC;
const client = makeClient(rpc);
const admin = keypair(env.CC_ADMIN_KEY);
const game = keypair(env.CC_GAME_KEY);
if (admin.toSuiAddress() !== env.CC_ADMIN_ADDRESS || game.toSuiAddress() !== env.CC_GAME_ADDRESS) throw new Error('key/address mismatch in devnet.env');
const gamePubkeyHex = Buffer.from(game.getPublicKey().toRawBytes()).toString('hex');
if (gamePubkeyHex !== env.CC_GAME_PUBKEY_HEX) throw new Error('CC_GAME_PUBKEY_HEX mismatch');

const changes = pub.objectChanges;
const packageId = changes.find((c) => c.type === 'published').packageId;
const byType = (suffix) => {
  const c = changes.find((c) => c.type === 'created' && c.objectType.endsWith(suffix));
  if (!c) throw new Error('missing created object ' + suffix);
  return c.objectId;
};
const lofiType = `${packageId}::lofi::LOFI`;
const suiType = '0x2::sui::SUI';
const ids = {
  adminCapId: byType('::admin::AdminCap'),
  faucetId: byType('::lofi::Faucet'),
  upgradeCapId: byType('::package::UpgradeCap'),
  metadataCapId: byType(`::coin_registry::MetadataCap<${lofiType}>`),
  pendingCurrencyId: byType(`::coin_registry::Currency<${lofiType}>`),
};

// Tx 1: register LOFI currency (shared, derived id), create both vaults, mint the LOFI bankroll to admin.
const tx1 = new Transaction();
tx1.moveCall({ target: '0x2::coin_registry::finalize_registration', typeArguments: [lofiType], arguments: [tx1.object('0xc'), tx1.object(ids.pendingCurrencyId)] });
const pk = tx1.pure.vector('u8', Array.from(Buffer.from(gamePubkeyHex, 'hex')));
tx1.moveCall({ target: `${packageId}::vault::create`, typeArguments: [suiType], arguments: [tx1.object(ids.adminCapId), pk] });
tx1.moveCall({ target: `${packageId}::vault::create`, typeArguments: [lofiType], arguments: [tx1.object(ids.adminCapId), pk] });
tx1.moveCall({ target: `${packageId}::lofi::admin_mint`, arguments: [tx1.object(ids.adminCapId), tx1.object(ids.faucetId), tx1.pure.u64(LOFI_BANKROLL), tx1.pure.address(admin.toSuiAddress())] });
const t1 = await run(client, tx1, admin, 'setup');
const vaultSui = created(t1, `::vault::Vault<${suiType.replace('0x2', '0x0000000000000000000000000000000000000000000000000000000000000002')}>`)[0]?.id
  ?? created(t1, '::vault::Vault<0x2::sui::SUI>')[0]?.id;
const vaultLofi = created(t1, `::vault::Vault<${lofiType}>`)[0]?.id;
const currencyId = created(t1, `::coin_registry::Currency<${lofiType}>`)[0]?.id;
const lofiCoin = created(t1, `::coin::Coin<${lofiType}>`)[0]?.id;
if (!vaultSui || !vaultLofi || !lofiCoin) throw new Error('setup: missing created objects ' + JSON.stringify(created(t1)));

// Tx 2: fund the house bankrolls.
const tx2 = new Transaction();
tx2.setSender(admin.toSuiAddress());
tx2.moveCall({ target: `${packageId}::vault::fund`, typeArguments: [lofiType], arguments: [tx2.object(vaultLofi), tx2.object(lofiCoin)] });
tx2.moveCall({ target: `${packageId}::vault::fund`, typeArguments: [suiType], arguments: [tx2.object(vaultSui), coinWithBalance({ balance: SUI_BANKROLL })] });
const t2 = await run(client, tx2, admin, 'fund');

const config = {
  network: 'devnet',
  rpc,
  rpcProtocol: 'gRPC-web via @mysten/sui 2.39.1 SuiGrpcClient (public fullnodes no longer serve JSON-RPC)',
  chainId: (await client.core.getChainIdentifier()).chainIdentifier,
  packageId,
  adminCapId: ids.adminCapId,
  faucetId: ids.faucetId,
  upgradeCapId: ids.upgradeCapId,
  lofiCurrencyId: currencyId ?? null,
  lofiMetadataCapId: ids.metadataCapId,
  coinRegistryId: '0xc',
  clockId: '0x6',
  lofiType,
  suiType,
  vaults: { SUI: { id: vaultSui }, LOFI: { id: vaultLofi } },
  decimals: { SUI: 9, LOFI: 9 },
  bankroll: { SUI: SUI_BANKROLL.toString(), LOFI: LOFI_BANKROLL.toString() },
  adminAddress: admin.toSuiAddress(),
  gameAddress: game.toSuiAddress(),
  gamePubkeyHex,
  publishedAt: new Date().toISOString(),
  digests: { publish: pub.digest, setup: t1.digest, fund: t2.digest },
};
writeFileSync(CONFIG, JSON.stringify(config, null, 2) + '\n');
console.log(JSON.stringify(config, null, 2));
