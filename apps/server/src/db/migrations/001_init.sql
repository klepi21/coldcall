-- Evens initial schema. Money is BIGINT minor units (1 credit = 100).

create extension if not exists pgcrypto;

-- ---------- Users and auth ----------
create table users (
  id               uuid primary key default gen_random_uuid(),
  wallet_address   text not null unique,
  wallet_kind      text not null default 'external' check (wallet_kind in ('external', 'embedded', 'privy')),
  privy_did        text unique,
  display_name     text not null,
  avatar           text not null default 'laurel',
  role             text not null default 'user' check (role in ('user', 'admin', 'house')),
  age_confirmed_at timestamptz,
  terms_version    text,
  terms_accepted_at timestamptz,
  -- Responsible play
  cooloff_until    timestamptz,
  excluded_until   timestamptz,
  limit_deposit_daily  bigint check (limit_deposit_daily  is null or limit_deposit_daily  > 0),
  limit_loss_daily     bigint check (limit_loss_daily     is null or limit_loss_daily     > 0),
  limit_loss_weekly    bigint check (limit_loss_weekly    is null or limit_loss_weekly    > 0),
  -- Skill estimates (never derived from money)
  ratings          jsonb not null default '{"chess":{"r":1500,"n":0},"backgammon":{"r":1500,"n":0},"tichu":{"r":1500,"n":0}}',
  settings         jsonb not null default '{}',
  onboarded_at     timestamptz,
  created_at       timestamptz not null default now()
);

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
                'house_bankroll', 'fee_revenue', 'vault_onchain', 'faucet_source')),
  user_id     uuid references users(id),
  table_id    uuid,
  balance     bigint not null default 0,  -- cached, always updated in the same transaction as entries
  created_at  timestamptz not null default now(),
  -- user accounts never go negative; system accounts may (vault_onchain mirrors outflows as negative)
  constraint user_non_negative check (kind not in ('user_available', 'user_locked', 'game_escrow') or balance >= 0)
);
create unique index ledger_accounts_unique
  on ledger_accounts(kind, coalesce(user_id, '00000000-0000-0000-0000-000000000000'), coalesce(table_id, '00000000-0000-0000-0000-000000000000'));

create table ledger_transactions (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null check (kind in (
                     'deposit', 'withdraw_lock', 'withdraw_release', 'withdraw_complete',
                     'game_start', 'game_settle', 'game_refund', 'bankroll_fund', 'adjustment')),
  idempotency_key  text not null unique,
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

-- Every transaction must balance to zero. Checked at commit time.
create or replace function ledger_check_balanced() returns trigger language plpgsql as $$
declare s bigint;
begin
  select coalesce(sum(amount), 0) into s from ledger_entries where transaction_id = new.transaction_id;
  if s <> 0 then
    raise exception 'ledger transaction % does not balance (sum %)', new.transaction_id, s;
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
create table deposits (
  signature     text primary key,
  user_id       uuid not null references users(id),
  amount_base   numeric(30,0) not null,   -- token base units (6 decimals)
  amount_minor  bigint not null,
  slot          bigint,
  status        text not null default 'credited' check (status in ('credited', 'rejected')),
  transaction_id uuid references ledger_transactions(id),
  created_at    timestamptz not null default now()
);
create index deposits_user on deposits(user_id, created_at desc);

create table withdrawals (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users(id),
  amount_minor   bigint not null check (amount_minor > 0),
  amount_base    numeric(30,0) not null,
  nonce          numeric(20,0) not null unique,  -- u64
  expiry         timestamptz not null,
  ticket_sig     text,                           -- base58 Ed25519 signature
  status         text not null default 'pending' check (status in ('review', 'pending', 'submitted', 'confirmed', 'expired', 'rejected')),
  tx_signature   text unique,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index withdrawals_user on withdrawals(user_id, created_at desc);
create index withdrawals_open on withdrawals(status) where status in ('review', 'pending', 'submitted');

create sequence withdrawal_nonce_seq start 1000;

create table chain_cursor (
  name        text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);

create table reserve_checks (
  id               bigserial primary key,
  vault_minor      bigint not null,
  liabilities_minor bigint not null,
  ok               boolean not null,
  checked_at       timestamptz not null default now()
);

-- ---------- Games ----------
create table game_tables (
  id             uuid primary key default gen_random_uuid(),
  game           text not null check (game in ('chess', 'backgammon', 'tichu')),
  mode           text not null check (mode in ('practice', 'bot', 'pvp')),
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
create index game_tables_lobby on game_tables(game, status, visibility, stake) where status = 'waiting';

create table table_seats (
  table_id    uuid not null references game_tables(id) on delete cascade,
  seat        int not null,
  user_id     uuid references users(id),
  is_bot      boolean not null default false,
  bot_name    text,
  joined_at   timestamptz not null default now(),
  payout      bigint,                          -- net credit change after settlement
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
