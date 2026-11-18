// Generates the ed25519 test vectors used in ../tests/vault_tests.move.
// The vault id is the deterministic id test_scenario gives the first vault in vault_tests::setup.
import { ticketMessage, signTicket } from './lib.mjs';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
const hex = (b) => Buffer.from(b).toString('hex');
const server = Ed25519Keypair.fromSecretKey(new Uint8Array(32).fill(7));
const other = Ed25519Keypair.fromSecretKey(new Uint8Array(32).fill(9));
const t = { vaultId: '0xd726ecf6f7036ee3557cd6c7b93a49b231070e8eecada9cfa157e40e3f02e5d3', recipient: '0xa11ce', amount: 400, nonce: 1, expiryMs: 10_000 };
console.log('SERVER_PK  =', hex(server.getPublicKey().toRawBytes()));
console.log('MSG        =', hex(ticketMessage(t)));
console.log('SIG        =', hex(await signTicket(server, t)));
console.log('SIG_OTHER  =', hex(await signTicket(other, t)));
const t2 = { ...t, amount: 100, nonce: 2 };
console.log('SIG2       =', hex(await signTicket(server, t2)), '(amount 100 nonce 2)');
