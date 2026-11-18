import { z } from 'zod';
import { resolve } from 'node:path';

const E = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().default('postgres://localhost:5432/coldcall_devnet'),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  /** Sui fullnode (gRPC). Public devnet fullnodes do not serve JSON-RPC any more. */
  SUI_RPC: z.string().default('https://fullnode.devnet.sui.io:443'),
  SUI_NETWORK: z.enum(['devnet', 'testnet', 'mainnet', 'localnet']).default('devnet'),
  /** Public ids of the Move package, vaults and faucet, written by move/scripts/publish.sh. */
  COLD_CALL_CONFIG: z.string().default(resolve(process.cwd(), '../../cold_call.config.json')),
  /** cc-game key (suiprivkey...): sponsors gas for user transactions and signs withdrawal tickets. Never commit. */
  CC_GAME_KEY: z.string().optional(),
  /** Google OAuth web client id for zkLogin. Without it, only the guest wallet sign in is offered. */
  GOOGLE_CLIENT_ID: z.string().optional(),
  /** Server secret for the stable zkLogin salt (HMAC of iss|aud|sub). Changing it changes every Google user's address. */
  ZK_SALT_SECRET: z.string().optional(),
  SESSION_DAYS: z.coerce.number().default(14),
  /** "Get test SUI": base units sent per claim (default 0.5 SUI), hours between claims, and the game wallet floor. */
  SUI_DRIP_BASE: z.coerce.bigint().default(500_000_000n),
  SUI_DRIP_HOURS: z.coerce.number().default(12),
  SUI_DRIP_FLOOR_BASE: z.coerce.bigint().default(2_000_000_000n),
  /** Comma separated wallet addresses that get the admin role on sign in. */
  ADMIN_WALLETS: z.string().default(''),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
});

export const env = E.parse(process.env);
export const isProd = env.NODE_ENV === 'production';
