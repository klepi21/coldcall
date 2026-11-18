import { z } from 'zod';
import { resolve } from 'node:path';

const E = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().default('postgres://localhost:5432/evens'),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  SOLANA_RPC: z.string().default('http://127.0.0.1:8899'),
  /** RPC URL handed to browsers. Keep private RPC keys (Helius etc.) in SOLANA_RPC only. */
  PUBLIC_SOLANA_RPC: z.string().optional(),
  SOLANA_CLUSTER: z.enum(['localnet', 'devnet']).default('localnet'),
  PROGRAM_ID: z.string().default('CRN6JXESEJUgFBAgYxf6bgGPq5iKya6jWhZphotQhyhN'),
  /** Written by `pnpm chain:setup`. */
  CHAIN_CONFIG: z.string().default(resolve(process.cwd(), '../../keys/chain.json')),
  /** Local file key for withdrawal tickets. Swap for KMS via lib/signer.ts. */
  SERVER_SIGNER_KEY: z.string().default(resolve(process.cwd(), '../../keys/server-signer.json')),
  MINT_AUTHORITY_KEY: z.string().default(resolve(process.cwd(), '../../keys/mint-authority.json')),
  DEPLOYER_KEY: z.string().default(resolve(process.cwd(), '../../keys/deployer.json')),
  SESSION_DAYS: z.coerce.number().default(14),
  /** Per user daily withdrawal limit in minor units (20,000 credits = $200). */
  WITHDRAW_USER_DAILY: z.coerce.number().int().default(2_000_000),
  /** Above this a withdrawal waits for admin review (10,000 credits = $100). */
  WITHDRAW_REVIEW_ABOVE: z.coerce.number().int().default(1_000_000),
  /** Faucet: test USDC per request and per day. */
  FAUCET_TOKENS: z.coerce.number().default(100),
  /** Comma separated wallet addresses that get the admin role on sign in. */
  ADMIN_WALLETS: z.string().default(''),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
});

export const env = E.parse(process.env);
export const isProd = env.NODE_ENV === 'production';
