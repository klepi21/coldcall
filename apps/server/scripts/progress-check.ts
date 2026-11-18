/**
 * Database check for progression: identical XP for a practice game and a credits game with the same play,
 * one award per table, ledger untouched. Cleans up after itself.
 *   cd apps/server && npx tsx --env-file=.env scripts/progress-check.ts
 */
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { chessEngine, Rng, commitFor } from '@evens/games';
import { pool, q, one } from '../src/db/pool';
import { awardProgress } from '../src/progress';

const moves = [['a2', 'a3'], ['a7', 'a6'], ['e2', 'e4'], ['e7', 'e5'], ['f1', 'c4'], ['b8', 'c6'], ['d1', 'h5'], ['g8', 'f6'], ['h5', 'f7']] as const;

async function setup(mode: 'practice' | 'pvp', stake: number) {
  const u = await one<{ id: string }>(pool, `insert into users(wallet_address, display_name) values ($1, 'Progress check') returning id`, ['chk' + randomBytes(16).toString('hex')]);
  const seed = randomBytes(32).toString('hex');
  const t = await one<{ id: string }>(
    pool,
    `insert into game_tables(game, mode, stake, fee, capacity, status, server_seed, seed_commit, created_by) values ('chess',$1,$2,0,2,'settled',$3,$4,$5) returning id`,
    [mode, stake, seed, commitFor(seed), u.id],
  );
  const rng = Rng.fromSeeds(seed, ['x']);
  let s = chessEngine.create({}, rng);
  for (const [k, [from, to]] of moves.entries()) {
    s = chessEngine.applyMove(s, k % 2, { from, to }, rng);
    await q(pool, `insert into game_moves(table_id, seq, seat, move) values ($1,$2,$3,$4)`, [t.id, k + 1, k % 2, JSON.stringify({ from, to })]);
  }
  return { userId: u.id, tableId: t.id, state: s, result: chessEngine.result(s)! };
}

const ledgerCount = async () => (await one<{ n: number }>(pool, `select count(*)::int as n from ledger_entries`)).n;

const created: { userId: string; tableId: string }[] = [];
try {
  const ledgerBefore = await ledgerCount();
  const a = await setup('practice', 0);
  const b = await setup('pvp', 3000);
  created.push(a, b);
  const pushed: string[] = [];
  const [pa] = await awardProgress({ tableId: a.tableId, game: 'chess', teams: chessEngine.teams, result: a.result, state: a.state, players: [{ seat: 0, userId: a.userId }] }, (u) => pushed.push(u));
  const [pb] = await awardProgress({ tableId: b.tableId, game: 'chess', teams: chessEngine.teams, result: b.result, state: b.state, players: [{ seat: 0, userId: b.userId }] }, (u) => pushed.push(u));
  assert.ok(pa && pb);
  const strip = (m: any) => ({ ...m, tableId: undefined });
  assert.deepEqual(strip(pb), strip(pa), 'practice and credits games must give identical progress');
  console.log('practice XP', pa.xpGained, 'credits XP', pb.xpGained, 'lines', pa.breakdown.map((l) => `${l.label} +${l.xp}`).join(', '));
  console.log('new achievements', pa.newAchievements.map((x) => x.code).join(', '), '| challenges done', pa.challengesDone.map((c) => c.code).join(', ') || 'none', '| level', pa.level);
  // Second award for the same table is a no-op
  const again = await awardProgress({ tableId: a.tableId, game: 'chess', teams: chessEngine.teams, result: a.result, state: a.state, players: [{ seat: 0, userId: a.userId }] }, () => {});
  assert.equal(again.length, 0, 'a table is only awarded once');
  assert.deepEqual(pushed, [a.userId, b.userId]);
  assert.equal(await ledgerCount(), ledgerBefore, 'progress must never write to the ledger');
  console.log('OK: identical XP across modes, idempotent, ledger untouched');
} finally {
  for (const c of created) {
    await q(pool, `delete from game_tables where id=$1`, [c.tableId]);
    await q(pool, `delete from users where id=$1`, [c.userId]);
  }
  await pool.end();
}
