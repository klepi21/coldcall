-- Cold Call initial schema.
-- Money is BIGINT minor units: 1 minor = 0.01 coin. There are two currencies, LOFI and SUI.
-- Every ledger account, transaction, deposit, withdrawal, reserve check and game table carries
-- exactly one currency, and nothing ever moves value from one currency to the other.

create extension if not exists pgcrypto;

-- ---------- Users and auth ----------
create table users (
  id               uuid primary key default gen_random_uuid(),
  wallet_address   text not null unique check (wallet_address ~ '^0x[0-9a-f]{64}$'),  -- Sui address
  wallet_kind      text not null check (wallet_kind in ('zklogin', 'guest')),
  google_sub       text unique,                     -- Google account id, zkLogin users only
  display_name     text not null,
  avatar           text not null default 'laurel',
  role             text not null default 'user' check (role in ('user', 'admin', 'house')),
  age_confirmed_at timestamptz,
  terms_version    text,
  terms_accepted_at timestamptz,
  -- Responsible play (money limits are per currency, see user_limits)
  cooloff_until    timestamptz,
  excluded_until   timestamptz,
  -- Skill estimates (never derived from money)
  ratings          jsonb not null default '{"chess":{"r":1500,"n":0},"backgammon":{"r":1500,"n":0},"tichu":{"r":1500,"n":0},"seabattle":{"r":1500,"n":0}}',
  settings         jsonb not null default '{}',
  onboarded_at     timestamptz,
  created_at       timestamptz not null default now()
);

-- Spending limits, one row per user and currency. A LOFI limit never applies to SUI and back.
create table user_limits (
  user_id        uuid not null references users(id) on delete cascade,
  currency       text not null check (currency in ('LOFI', 'SUI')),
  deposit_daily  bigint check (deposit_daily is null or deposit_daily > 0),
  loss_daily     bigint check (loss_daily    is null or loss_daily    > 0),
  loss_weekly    bigint check (loss_weekly   is null or loss_weekly   > 0),
  pending        jsonb,          -- raised or removed limits wait 24 hours
  pending_at     timestamptz,
  primary key (user_id, currency)
);

-- One time sign in challenges for guest wallets (Ed25519 key kept in the browser).
create table auth_nonces (
  nonce       text primary key,
  address     text not null,
  expires_at  timestamptz not null,
  used        boolean not null default false
);

create table sessions (
  id          text primary key,           -- random 32 bytes hex, stored in an httpOnly cookie
  user_id     uuid not null references users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index sessions_user on sessions(user_id);

-- ---------- Ledger (double entry) ----------
create table ledger_accounts (
  id          bigserial primary key,
  kind        text not null check (kind in (
                'user_available', 'user_locked', 'game_escrow',
                'house_bankroll', 'fee_revenue', 'vault_onchain')),
  currency    text not null check (currency in ('LOFI', 'SUI')),
  user_id     uuid references users(id),
  table_id    uuid,
  balance     bigint not null default 0,  -- cached, always updated in the same transaction as entries
  created_at  timestamptz not null default now(),
  -- user accounts never go negative; system accounts may (vault_onchain mirrors outflows as negative)
  constraint user_non_negative check (kind not in ('user_available', 'user_locked', 'game_escrow') or balance >= 0)
);
create unique index ledger_accounts_unique
  on ledger_accounts(kind, currency, coalesce(user_id, '00000000-0000-0000-0000-000000000000'), coalesce(table_id, '00000000-0000-0000-0000-000000000000'));

create table ledger_transactions (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null check (kind in (
                     'deposit', 'withdraw_lock', 'withdraw_release', 'withdraw_complete',
                     'game_start', 'game_settle', 'game_refund', 'bankroll_fund', 'bankroll_withdraw', 'adjustment')),
  idempotency_key  text not null unique,
  currency         text not null check (currency in ('LOFI', 'SUI')),
  user_id          uuid references users(id),
  table_id         uuid,
  memo             text,
  meta             jsonb not null default '{}',
  created_at       timestamptz not null default now()
);

create table ledger_entries (
  id              bigserial primary key,
  transaction_id  uuid not null references ledger_transactions(id),
  account_id      bigint not null references ledger_accounts(id),
  amount          bigint not null check (amount <> 0),
  created_at      timestamptz not null default now()
);
create index ledger_entries_tx on ledger_entries(transaction_id);
create index ledger_entries_account on ledger_entries(account_id, id);

-- Every transaction must balance to zero, and every entry must use an account of the transaction's
-- currency. Checked at commit time, so no code path can mix LOFI and SUI.
create or replace function ledger_check_balanced() returns trigger language plpgsql as $$
declare s bigint; mixed int;
begin
  select coalesce(sum(amount), 0) into s from ledger_entries where transaction_id = new.transaction_id;
  if s <> 0 then
    raise exception 'ledger transaction % does not balance (sum %)', new.transaction_id, s;
  end if;
  select count(*) into mixed
    from ledger_entries e
    join ledger_accounts a on a.id = e.account_id
    join ledger_transactions t on t.id = e.transaction_id
   where e.transaction_id = new.transaction_id and a.currency <> t.currency;
  if mixed > 0 then
    raise exception 'ledger transaction % mixes currencies', new.transaction_id;
  end if;
  return null;
end $$;
create constraint trigger ledger_balanced
  after insert on ledger_entries deferrable initially deferred
  for each row execute function ledger_check_balanced();

-- Entries are append only.
create or replace function ledger_no_update() returns trigger language plpgsql as $$
begin raise exception 'ledger entries are append only'; end $$;
create trigger ledger_entries_no_update before update or delete on ledger_entries
  for each row execute function ledger_no_update();

-- ---------- Chain ----------
-- One row per Deposited (user) or Funded (house) vault event. Idempotent on digest + event index.
create table deposits (
  digest        text not null,            -- Sui transaction digest
  event_seq     int not null,             -- index of the event inside the transaction
  currency      text not null check (currency in ('LOFI', 'SUI')),
  kind          text not null default 'user' check (kind in ('user', 'house')),
  sender        text not null,            -- Deposited.user or Funded.from
  user_id       uuid references users(id),
  check (kind = 'house' or user_id is not null),
  amount_base   numeric(30,0) not null,   -- coin base units (9 decimals)
  amount_minor  bigint not null,
  checkpoint    bigint,
  status        text not null default 'credited' check (status in ('credited', 'rejected')),
  transaction_id uuid references ledger_transactions(id),
  created_at    timestamptz not null default now(),
  primary key (digest, event_seq)
);
create index deposits_user on deposits(user_id, created_at desc);

create table withdrawals (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users(id),
  currency       text not null check (currency in ('LOFI', 'SUI')),
  amount_minor   bigint not null check (amount_minor > 0),
  amount_base    numeric(30,0) not null,
  nonce          numeric(20,0) not null unique,  -- u64, single use per vault
  expiry         timestamptz not null,
  ticket_sig     text,                           -- hex Ed25519 signature over the 88 byte ticket
  status         text not null default 'pending' check (status in ('review', 'pending', 'submitted', 'confirmed', 'expired', 'rejected')),
  tx_digest      text unique,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index withdrawals_user on withdrawals(user_id, created_at desc);
create index withdrawals_open on withdrawals(status) where status in ('review', 'pending', 'submitted');

-- Ticket nonces are random 62 bit values (see wallet.ts), never a sequence: vaults remember used nonces forever.

create table chain_cursor (
  name        text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);

create table reserve_checks (
  id               bigserial primary key,
  currency         text not null check (currency in ('LOFI', 'SUI')),
  vault_minor      bigint not null,
  liabilities_minor bigint not null,
  ok               boolean not null,
  checked_at       timestamptz not null default now()
);
create index reserve_checks_latest on reserve_checks(currency, id desc);

-- Test coins handed out by the game wallet ("Get test SUI") and faucet claims, for rate limits.
create table faucet_claims (
  id          bigserial primary key,
  user_id     uuid not null references users(id),
  currency    text not null check (currency in ('LOFI', 'SUI')),
  amount_base numeric(30,0) not null,
  digest      text,
  created_at  timestamptz not null default now()
);
create index faucet_claims_user on faucet_claims(user_id, currency, created_at desc);

-- ---------- Games ----------
create table game_tables (
  id             uuid primary key default gen_random_uuid(),
  game           text not null check (game in ('chess', 'backgammon', 'tichu', 'seabattle')),
  mode           text not null check (mode in ('practice', 'bot', 'pvp')),
  currency       text not null check (currency in ('LOFI', 'SUI')),   -- practice tables carry the player's active coin, stake 0
  stake          bigint not null default 0 check (stake >= 0),
  fee            bigint not null default 0 check (fee >= 0),
  capacity       int not null check (capacity in (2, 4)),
  status         text not null default 'waiting' check (status in ('waiting', 'playing', 'settled', 'cancelled')),
  visibility     text not null default 'public' check (visibility in ('public', 'private')),
  invite_code    text unique,
  time_control   text,
  bot_level      int,
  bot_meta       jsonb not null default '{}',     -- disclosed calibration inputs (rating used, engine elo)
  server_seed    text not null,                   -- secret until the game ends
  seed_commit    text not null,
  client_seeds   jsonb not null default '[]',
  result         jsonb,
  created_by     uuid references users(id),
  created_at     timestamptz not null default now(),
  started_at     timestamptz,
  ended_at       timestamptz
);
create index game_tables_lobby on game_tables(game, currency, status, visibility, stake) where status = 'waiting';

create table table_seats (
  table_id    uuid not null references game_tables(id) on delete cascade,
  seat        int not null,
  user_id     uuid references users(id),
  is_bot      boolean not null default false,
  bot_name    text,
  joined_at   timestamptz not null default now(),
  payout      bigint,                          -- net change after settlement, in the table's currency
  primary key (table_id, seat)
);
create unique index table_seats_user on table_seats(table_id, user_id) where user_id is not null;
create index table_seats_by_user on table_seats(user_id, joined_at desc);

create table game_states (
  table_id    uuid primary key references game_tables(id) on delete cascade,
  seq         int not null default 0,
  state       jsonb not null,
  rng_state   jsonb not null,
  clocks      jsonb,
  updated_at  timestamptz not null default now()
);

create table game_moves (
  table_id    uuid not null references game_tables(id) on delete cascade,
  seq         int not null,
  seat        int not null,
  move        jsonb not null,
  think_ms    int,
  created_at  timestamptz not null default now(),
  primary key (table_id, seq)
);

create table schema_migrations (
  name        text primary key,
  applied_at  timestamptz not null default now()
);
