/**
 * Currency isolation against a real Postgres (database coldcall_test, recreated for every run).
 * LOFI and SUI must never touch each other: not in the ledger, not at a table, not in matchmaking,
 * not in the reserve check, not in the bot bankroll.
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://localhost:5432/coldcall_test';
process.env.NODE_ENV = 'test';

let db: typeof import('../src/db/pool');
let ledger: typeof import('../src/ledger');
let rooms: typeof import('../src/games/rooms');
let wallet: typeof import('../src/wallet');

const addr = (n: number) => `0x${n.toString(16).padStart(64, '0')}`;
let seq = 1;

async function newUser() {
  const u = await db.one<{ id: string }>(
    db.pool,
    `insert into users(wallet_address, wallet_kind, display_name, age_confirmed_at, terms_accepted_at, terms_version)
     values ($1, 'guest', $2, now(), now(), 'test') returning id`,
    [addr(seq), `Tester ${seq++}`],
  );
  return u.id;
}

async function fund(userId: string, currency: 'LOFI' | 'SUI', amount: number) {
  await db.tx((c) =>
    ledger.post(c, { kind: 'deposit', key: `test-deposit:${userId}:${currency}:${seq++}`, currency, userId }, [
      { ref: { kind: 'vault_onchain', currency }, amount: -amount },
      { ref: { kind: 'user_available', currency, userId }, amount },
    ]),
  );
}

async function fundHouse(currency: 'LOFI' | 'SUI', amount: number) {
  await db.tx((c) =>
    ledger.post(c, { kind: 'bankroll_fund', key: `test-house:${currency}:${seq++}`, currency }, [
      { ref: { kind: 'vault_onchain', currency }, amount: -amount },
      { ref: { kind: 'house_bankroll', currency }, amount },
    ]),
  );
}

const avail = async (userId: string) => {
  const b = await ledger.balances(db.pool, userId);
  return { LOFI: b.LOFI.available, SUI: b.SUI.available };
};

beforeAll(async () => {
  const name = new URL(process.env.DATABASE_URL!).pathname.slice(1);
  execSync(`dropdb --if-exists ${name} && createdb ${name}`, { stdio: 'ignore' });
  db = await import('../src/db/pool');
  const { migrate } = await import('../src/db/migrate');
  await migrate(() => {});
  ledger = await import('../src/ledger');
  rooms = await import('../src/games/rooms');
  wallet = await import('../src/wallet');
});

afterAll(async () => {
  await db?.pool.end();
});

describe('ledger currency isolation', () => {
  it('post() refuses a transaction whose legs mix currencies', async () => {
    const u = await newUser();
    await expect(
      db.tx((c) =>
        ledger.post(c, { kind: 'deposit', key: 'mixed-1', currency: 'LOFI', userId: u }, [
          { ref: { kind: 'vault_onchain', currency: 'LOFI' }, amount: -100 },
          { ref: { kind: 'user_available', currency: 'SUI', userId: u }, amount: 100 },
        ]),
      ),
    ).rejects.toThrow(/currency mismatch/);
    expect(await avail(u)).toEqual({ LOFI: 0, SUI: 0 });
  });

  it('the database trigger rejects mixed currencies even if code bypasses post()', async () => {
    const u = await newUser();
    await fund(u, 'SUI', 50);
    const sui = await db.one<{ id: number }>(db.pool, `select id from ledger_accounts where kind='user_available' and currency='SUI' and user_id=$1`, [u]);
    const vault = await db.one<{ id: number }>(db.pool, `select id from ledger_accounts where kind='vault_onchain' and currency='SUI'`);
    await expect(
      db.tx(async (c) => {
        const t = await db.one<{ id: string }>(c, `insert into ledger_transactions(kind, idempotency_key, currency) values ('adjustment','bypass-1','LOFI') returning id`);
        await c.query(`insert into ledger_entries(transaction_id, account_id, amount) values ($1,$2,-10),($1,$3,10)`, [t.id, sui.id, vault.id]);
      }),
    ).rejects.toThrow(/mixes currencies/);
  });

  it('balances are reported per currency', async () => {
    const u = await newUser();
    await fund(u, 'LOFI', 12_345);
    await fund(u, 'SUI', 7);
    expect(await avail(u)).toEqual({ LOFI: 12_345, SUI: 7 });
  });
});

describe('tables are played in one currency', () => {
  it('a LOFI table takes only LOFI and never touches SUI', async () => {
    const u = await newUser();
    await fund(u, 'LOFI', 10_000);
    await fund(u, 'SUI', 100);
    const id = await rooms.createTable({ userId: u, game: 'chess', mode: 'pvp', currency: 'LOFI', stake: 1_000, visibility: 'public', clientSeed: 'a' });
    // 10.00 LOFI stake plus 0.50 LOFI fee held for the game
    expect(await avail(u)).toEqual({ LOFI: 10_000 - 1_050, SUI: 100 });
    const t = await db.one<{ currency: string }>(db.pool, `select currency from game_tables where id=$1`, [id]);
    expect(t.currency).toBe('LOFI');
    const escrow = await db.q<{ currency: string }>(db.pool, `select currency from ledger_accounts where table_id=$1`, [id]);
    expect(escrow.every((e) => e.currency === 'LOFI')).toBe(true);
    // leaving refunds in LOFI only
    await rooms.leaveTable(u, id);
    expect(await avail(u)).toEqual({ LOFI: 10_000, SUI: 100 });
  });

  it('a player with only SUI cannot sit at a LOFI table', async () => {
    const host = await newUser();
    await fund(host, 'LOFI', 5_000);
    const id = await rooms.createTable({ userId: host, game: 'chess', mode: 'pvp', currency: 'LOFI', stake: 100, visibility: 'public', clientSeed: 'h' });
    const p = await newUser();
    await fund(p, 'SUI', 1_000_000); // plenty of SUI, no LOFI
    const err = await rooms.joinTable(p, id, 'p').catch((e) => e);
    expect(err).toBeInstanceOf(ledger.InsufficientFunds);
    expect(err.currency).toBe('LOFI');
    expect(await avail(p)).toEqual({ LOFI: 0, SUI: 1_000_000 });
    await rooms.leaveTable(host, id);
  });

  it('stake rules are per currency: a LOFI sized stake is not a valid SUI stake', async () => {
    const u = await newUser();
    await fund(u, 'SUI', 100_000);
    await expect(rooms.createTable({ userId: u, game: 'chess', mode: 'pvp', currency: 'SUI', stake: 10_000, visibility: 'public', clientSeed: 'x' })).rejects.toThrow(/biggest stake/);
  });
});

describe('matchmaking pairs only the same currency and stake', () => {
  it('quick match never puts a SUI player at a LOFI table with the same number', async () => {
    const a = await newUser();
    const b = await newUser();
    const c = await newUser();
    await fund(a, 'LOFI', 1_000);
    await fund(b, 'SUI', 1_000);
    await fund(c, 'LOFI', 1_000);
    // 100 minor is 1.00 LOFI and also 1.00 SUI: same number, different money.
    const ta = await rooms.quickMatch(a, 'backgammon', 'LOFI', 100, undefined, 'a');
    const tb = await rooms.quickMatch(b, 'backgammon', 'SUI', 100, undefined, 'b');
    expect(tb).not.toBe(ta);
    const tc = await rooms.quickMatch(c, 'backgammon', 'LOFI', 100, undefined, 'c');
    expect(tc).toBe(ta);
    const lobbyLofi = await rooms.lobbyTables('backgammon', 'LOFI');
    const lobbySui = await rooms.lobbyTables('backgammon', 'SUI');
    expect(lobbySui.map((t) => t.id)).toContain(tb);
    expect(lobbySui.every((t) => t.currency === 'SUI')).toBe(true);
    expect(lobbyLofi.every((t) => t.currency === 'LOFI')).toBe(true);
    // b paid only SUI, c paid only LOFI
    expect((await avail(b)).LOFI).toBe(0);
    expect((await avail(c)).SUI).toBe(0);
  });
});

describe('house bankroll and reserve are per currency', () => {
  it('a SUI bot game is refused when only the LOFI bankroll has money', async () => {
    await fundHouse('LOFI', 100_000_000);
    const u = await newUser();
    await fund(u, 'SUI', 100);
    await expect(rooms.createTable({ userId: u, game: 'backgammon', mode: 'bot', currency: 'SUI', stake: 5, visibility: 'public', clientSeed: 's' })).rejects.toThrow(/Bot games in SUI are paused/);
    expect((await avail(u)).SUI).toBe(100);
    expect(await ledger.houseBankroll(db.pool, 'SUI')).toBe(0);
    expect(await ledger.houseBankroll(db.pool, 'LOFI')).toBe(100_000_000);
  });

  it('the reserve check compares each vault only with its own currency', async () => {
    const owedLofi = await ledger.liabilities(db.pool, 'LOFI');
    const owedSui = await ledger.liabilities(db.pool, 'SUI');
    expect(owedLofi).toBeGreaterThan(owedSui);
    // A SUI vault that covers SUI is fine, however large LOFI liabilities are.
    const sui = await wallet.reserveCheckFor('SUI', owedSui);
    expect(sui).toMatchObject({ currency: 'SUI', ok: true, liabilities: owedSui });
    // A LOFI vault holding as many units as the SUI vault does not cover LOFI.
    const lofi = await wallet.reserveCheckFor('LOFI', owedSui);
    expect(lofi).toMatchObject({ currency: 'LOFI', ok: false, liabilities: owedLofi });
    const rows = await db.q<{ currency: string; ok: boolean }>(db.pool, `select currency, ok from reserve_checks order by id`);
    expect(rows.slice(-2)).toEqual([
      { currency: 'SUI', ok: true },
      { currency: 'LOFI', ok: false },
    ]);
  });
});

describe('deposits are idempotent on digest and event index', () => {
  it('the same Deposited event credits once, in its own currency', async () => {
    const u = await newUser();
    const user = await db.one<{ wallet_address: string }>(db.pool, `select wallet_address from users where id=$1`, [u]);
    // Vault ids come from the config; fake the currency directly on the event.
    const ev = { type: 'Deposited' as const, digest: 'TestDigest1111111111111111111111111111111111', eventSeq: 0, currency: 'SUI' as const, user: user.wallet_address, amountBase: 250_000_000n, nonce: null, checkpoint: 1 };
    expect((await wallet.applyVaultEvent(ev)).credited).toBe(true);
    expect((await wallet.applyVaultEvent(ev)).credited).toBe(false);
    expect(await avail(u)).toEqual({ LOFI: 0, SUI: 25 });
    // a second event in the same transaction is a different deposit
    expect((await wallet.applyVaultEvent({ ...ev, eventSeq: 1 })).credited).toBe(true);
    expect(await avail(u)).toEqual({ LOFI: 0, SUI: 50 });
  });
});
