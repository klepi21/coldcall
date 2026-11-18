// Prints the total SUI balance (coins + address balance) of an address in MIST. Usage: node balance.mjs <address> [coinType]
import { makeClient } from './lib.mjs';
const [owner, coinType = '0x2::sui::SUI'] = process.argv.slice(2);
const { balance } = await makeClient().getBalance({ owner, coinType });
console.log(balance.balance);
