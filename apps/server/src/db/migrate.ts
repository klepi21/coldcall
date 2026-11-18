import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool';

export async function migrate(log = console.log) {
  const dir = join(dirname(fileURLToPath(import.meta.url)), 'migrations');
  await pool.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
  const done = new Set((await pool.query('select name from schema_migrations')).rows.map((r) => r.name));
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(f)) continue;
    const sql = readFileSync(join(dir, f), 'utf8').replace(/create table schema_migrations[\s\S]*?\);\s*$/m, '');
    const c = await pool.connect();
    try {
      await c.query('begin');
      await c.query(sql);
      await c.query('insert into schema_migrations(name) values ($1)', [f]);
      await c.query('commit');
      log(`migrated ${f}`);
    } catch (e) {
      await c.query('rollback');
      throw e;
    } finally {
      c.release();
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate().then(() => pool.end(), (e) => { console.error(e); process.exit(1); });
}
