-- Progression: XP, levels, per game stats, achievements, daily challenges, cosmetics.
-- Nothing here reads or writes money. XP never depends on mode, stake or balance.

create table user_progress (
  user_id     uuid primary key references users(id) on delete cascade,
  xp          bigint not null default 0 check (xp >= 0),   -- lifetime XP
  level       int not null default 1 check (level >= 1),
  -- Equipped cosmetics by slot, e.g. {"title":"regular","frame":"lime"}. Unlocks are derived from level and achievements.
  equipped    jsonb not null default '{}',
  updated_at  timestamptz not null default now()
);

create table user_game_stats (
  user_id      uuid not null references users(id) on delete cascade,
  game         text not null check (game in ('chess', 'backgammon', 'tichu', 'seabattle')),
  games        int not null default 0,
  wins         int not null default 0,
  draws        int not null default 0,
  losses       int not null default 0,
  win_streak   int not null default 0,
  best_streak  int not null default 0,
  xp           bigint not null default 0,                    -- XP earned in this game, drives the per game rank
  -- Game specific counters: checkmates, promotions, gammons, tichus_made, best_shots, best_hit_run ...
  extra        jsonb not null default '{}',
  updated_at   timestamptz not null default now(),
  primary key (user_id, game)
);

create table user_achievements (
  user_id      uuid not null references users(id) on delete cascade,
  code         text not null,
  unlocked_at  timestamptz not null default now(),
  table_id     uuid references game_tables(id) on delete set null,
  primary key (user_id, code)
);

create table daily_challenge_progress (
  user_id   uuid not null references users(id) on delete cascade,
  day       date not null,           -- UTC day
  code      text not null,
  progress  int not null default 0,
  target    int not null,
  done_at   timestamptz,
  -- distinct games played today, for "play two different games"
  meta      jsonb not null default '{}',
  primary key (user_id, day, code)
);

-- One award per player per table. Makes settlement retries and recovered rooms safe.
create table xp_awards (
  user_id     uuid not null references users(id) on delete cascade,
  table_id    uuid not null references game_tables(id) on delete cascade,
  game        text not null,
  xp          int not null,
  detail      jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  primary key (user_id, table_id)
);
create index xp_awards_user on xp_awards(user_id, created_at desc);
